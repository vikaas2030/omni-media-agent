import test from 'node:test';
import assert from 'node:assert/strict';
import { Registry } from '../src/core/registry.js';
import type { Provider } from '../src/core/types.js';
import { generateBest } from '../src/core/quality.js';

/**
 * A scripted fake LLM provider. The quality gate calls generate() twice per
 * attempt (draft, then critique), so responses replay in order.
 * Registered under the 'llm' chain id from config/models.json.
 */
function scriptedLLM(responses: string[]): { provider: Provider; prompts: string[] } {
  let i = 0;
  const prompts: string[] = [];
  return {
    prompts,
    provider: {
      id: 'local:ollama',
      modality: 'llm' as const,
      type: 'local' as const,
      health: async () => true,
      generate: async (req) => {
        prompts.push(String(req.input));
        const text = responses[Math.min(i, responses.length - 1)];
        i++;
        return {
          text,
          providerId: 'local:ollama',
          providerType: 'local',
          fallbackChainUsed: ['local:ollama'],
          warnings: [],
        };
      },
    },
  };
}

function reg(p: Provider): Registry {
  const r = new Registry();
  r.register(p);
  return r;
}

const isGood = (t: string) => ({ ok: t.startsWith('GOOD'), issues: t.startsWith('GOOD') ? [] : ['output did not pass the shape check'] });

test('generateBest refines invalid → scores low → accepts high score', async () => {
  const llm = scriptedLLM([
    'BAD FIRST DRAFT',                                      // attempt 1 draft
    'GOOD DRAFT ONE',                                       // attempt 2 draft
    '{"score": 5, "issues": ["weak hook"]}',                // attempt 2 critique
    'GOOD DRAFT TWO',                                       // attempt 3 draft
    '{"score": 9, "issues": []}',                           // attempt 3 critique
  ]);
  const out = await generateBest({
    kind: 'script',
    firstPrompt: 'write a script',
    platform: 'youtube',
    validate: isGood,
    registry: reg(llm.provider),
  });
  assert.equal(out.text, 'GOOD DRAFT TWO');
  assert.equal(out.score, 9);
  assert.equal(out.attempts, 3);
  assert.equal(out.critiqueAvailable, true);
  // prompts: [draft1, draft2(refine), critique2, refine3, draft3, critique3]
  const refine3 = llm.prompts[3];
  assert.ok(refine3.includes('weak hook'), 'refine prompt must carry critique feedback');
  assert.match(refine3, /rewrite/i);
});

test('generateBest accepts a valid draft when critique is unavailable', async () => {
  const llm = scriptedLLM(['GOOD DRAFT', 'sorry, I cannot score that']);
  const out = await generateBest({
    kind: 'script',
    firstPrompt: 'write a script',
    platform: 'youtube',
    validate: isGood,
    registry: reg(llm.provider),
  });
  assert.equal(out.text, 'GOOD DRAFT');
  assert.equal(out.score, -1);
  assert.equal(out.attempts, 1);
  assert.equal(out.critiqueAvailable, false);
});

test('generateBest returns the best attempt when the bar is never cleared', async () => {
  const llm = scriptedLLM([
    'BAD',                            // attempt 1 draft (invalid)
    'GOOD A', '{"score": 4, "issues": ["meh"]}',  // attempt 2: 4
    'GOOD B', '{"score": 6, "issues": ["still meh"]}', // attempt 3: 6
  ]);
  const out = await generateBest({
    kind: 'script',
    firstPrompt: 'write a script',
    platform: 'youtube',
    validate: isGood,
    registry: reg(llm.provider),
  });
  assert.equal(out.text, 'GOOD B');
  assert.equal(out.score, 6);
  assert.equal(out.attempts, 3); // QUALITY_MAX_ATTEMPTS default 3
});

test('generateBest falls back to best-effort content when validation never passes', async () => {
  process.env.QUALITY_MAX_ATTEMPTS = '2';
  try {
    const llm = scriptedLLM(['SOMETHING A', 'SOMETHING B']);
    const out = await generateBest({
      kind: 'script',
      firstPrompt: 'write a script',
      platform: 'youtube',
      validate: isGood,
      registry: reg(llm.provider),
    });
    assert.equal(out.text, 'SOMETHING B');
    assert.equal(out.score, 0);
    assert.ok(out.log.some((l) => /best-effort/.test(l)));
  } finally {
    delete process.env.QUALITY_MAX_ATTEMPTS;
  }
});
