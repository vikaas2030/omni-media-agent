import test from 'node:test';
import assert from 'node:assert/strict';
import { Registry } from '../src/core/registry.js';
import { NoProviderAvailableError, Provider } from '../src/core/types.js';

function fakeProvider(
  id: string,
  type: 'local' | 'external',
  healthy = true
): Provider {
  return {
    id,
    modality: 'video',
    type,
    health: async () => healthy,
    generate: async () => {
      throw new Error('not used in this test');
    },
  };
}

test('local providers always rank before external in the chain', async () => {
  const reg = new Registry();
  reg.register(fakeProvider('external:seedance', 'external'));
  reg.register(fakeProvider('local:ffmpeg-anim', 'local'));
  const chain = reg.chain('video');
  assert.equal(chain[0].id, 'local:ffmpeg-anim');
  assert.equal(chain[1].id, 'external:seedance');
});

test('route() skips unhealthy providers', async () => {
  const reg = new Registry();
  reg.register(fakeProvider('local:dead', 'local', false));
  reg.register(fakeProvider('external:alive', 'external', true));
  const p = await reg.route('video', { allowExternal: true });
  assert.equal(p.id, 'external:alive');
});

test('route() never picks external when allowExternal is false', async () => {
  const reg = new Registry();
  reg.register(fakeProvider('external:only', 'external', true));
  await assert.rejects(
    () => reg.route('video', { allowExternal: false }),
    NoProviderAvailableError
  );
});
