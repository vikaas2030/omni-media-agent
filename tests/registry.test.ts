import test from 'node:test';
import assert from 'node:assert/strict';
import { Registry } from '../src/core/registry.js';
import { NoProviderAvailableError, Provider } from '../src/core/types.js';

function fakeProvider(
  id: string,
  type: 'local' | 'external',
  modality: 'video' | 'llm' = 'video',
  healthy = true
): Provider {
  return {
    id,
    modality,
    type,
    health: async () => healthy,
    generate: async () => {
      throw new Error('not used in this test');
    },
  };
}

test('chain follows config/models.json order (video: external first, local floor last)', async () => {
  const reg = new Registry();
  // ids that exist in config/models.json routing chains
  reg.register(fakeProvider('local:ffmpeg-anim', 'local'));
  reg.register(fakeProvider('external:veo', 'external'));
  reg.register(fakeProvider('external:seedance', 'external'));

  const chain = reg.chain('video');
  assert.equal(chain.map((p) => p.id).join(','), 'external:veo,external:seedance,local:ffmpeg-anim');
});

test('route() skips unhealthy providers down the chain', async () => {
  const reg = new Registry();
  reg.register(fakeProvider('external:veo', 'external', 'video', false));
  reg.register(fakeProvider('local:ffmpeg-anim', 'local', 'video', true));
  const p = await reg.route('video', { allowExternal: true });
  assert.equal(p.id, 'local:ffmpeg-anim');
});

test('route() never picks external when allowExternal is false', async () => {
  const reg = new Registry();
  reg.register(fakeProvider('external:veo', 'external'));
  reg.register(fakeProvider('local:ffmpeg-anim', 'local'));
  const p = await reg.route('video', { allowExternal: false });
  assert.equal(p.type, 'local');
});

test('route() throws when nothing in the chain is available', async () => {
  const reg = new Registry();
  reg.register(fakeProvider('external:veo', 'external', 'video', false));
  reg.register(fakeProvider('local:ffmpeg-anim', 'local', 'video', false));
  await assert.rejects(() => reg.route('video', {}), NoProviderAvailableError);
});
