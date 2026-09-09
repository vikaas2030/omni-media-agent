/**
 * Quality gate — generate → validate → LLM self-critique → refine loop.
 * The first LLM draft is never blindly accepted; a strict editor pass scores
 * it on a rubric and the writer rewrites until it clears the bar (or the
 * best attempt so far wins). Env-tunable:
 *   QUALITY_MIN_SCORE   (default 7)  — bar the critique must clear
 *   QUALITY_MAX_ATTEMPTS (default 3) — refinement attempts per step
 */

import { generate } from './router.js';
import type { Registry } from './registry.js';
import { critiquePrompt, refinePrompt } from './prompts.js';
import { parseCritique } from './validate.js';

export interface QualityOutcome {
  text: string;
  score: number; // -1 = critique unavailable, validator-only acceptance
  attempts: number;
  critiqueAvailable: boolean;
  externalCostUsd: number; // observability only
  log: string[];
}

const envNum = (key: string, dflt: number): number => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : dflt;
};

export async function generateBest(opts: {
  kind: 'script' | 'storyboard';
  firstPrompt: string;
  platform: string;
  validate: (text: string) => { ok: boolean; issues: string[] };
  registry: Registry;
}): Promise<QualityOutcome> {
  const maxAttempts = Math.max(1, Math.min(5, Math.floor(envNum('QUALITY_MAX_ATTEMPTS', 3))));
  const minScore = envNum('QUALITY_MIN_SCORE', 7);
  const log: string[] = [];
  let spend = 0;

  let prompt = opts.firstPrompt;
  let best: { text: string; score: number } | null = null;
  let bestEffort = '';
  let critiqueAvailable = true;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await generate({ modality: 'llm', input: prompt }, opts.registry);
    spend += res.externalCostUsd ?? 0;
    const text = (res.text ?? '').trim();
    if (text) bestEffort = text;

    const v = opts.validate(text);
    if (!v.ok) {
      log.push(`attempt ${attempt}: invalid — ${v.issues.join('; ')}`);
      prompt = refinePrompt(opts.kind, text, v.issues);
      continue;
    }

    // Valid output → strict editor critique
    let score = -1;
    const feedback: string[] = [];
    try {
      const c = await generate(
        { modality: 'llm', input: critiquePrompt(opts.kind, text, opts.platform) },
        opts.registry
      );
      spend += c.externalCostUsd ?? 0;
      const parsed = parseCritique(c.text);
      if (parsed) {
        score = parsed.score;
        feedback.push(...parsed.issues);
      } else {
        critiqueAvailable = false;
      }
    } catch {
      critiqueAvailable = false;
    }

    if (score < 0) {
      // Critique loop unavailable (no LLM for the 2nd pass, bad JSON, …).
      // Don't block the pipeline: valid output passes on its own merits.
      log.push(`attempt ${attempt}: valid; critique unavailable — accepted`);
      return { text, score: -1, attempts: attempt, critiqueAvailable, externalCostUsd: spend, log };
    }

    if (!best || score > best.score) best = { text, score };
    if (score >= minScore) {
      log.push(`attempt ${attempt}: critique ${score}/10 — accepted`);
      return { text, score, attempts: attempt, critiqueAvailable, externalCostUsd: spend, log };
    }
    log.push(`attempt ${attempt}: critique ${score}/10 (bar: ${minScore}) — refining`);
    prompt = refinePrompt(opts.kind, text, feedback);
  }

  if (best) {
    log.push(`returning best attempt (critique ${best.score}/10 after ${maxAttempts} attempts)`);
    return {
      text: best.text,
      score: best.score,
      attempts: maxAttempts,
      critiqueAvailable,
      externalCostUsd: spend,
      log,
    };
  }
  if (bestEffort) {
    log.push(`returning best-effort output — validation never passed but content exists`);
    return { text: bestEffort, score: 0, attempts: maxAttempts, critiqueAvailable, externalCostUsd: spend, log };
  }
  throw new Error(`quality gate: no usable output after ${maxAttempts} attempts`);
}
