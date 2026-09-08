import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAvatarStatus } from '../src/providers/avatar.js';
import { spendEstimateUsd } from '../src/providers/external.js';

test('parseAvatarStatus: HeyGen nested completed shape', () => {
  const st = parseAvatarStatus({
    code: 100,
    data: { status: 'completed', video_url: 'https://cdn.example/v.mp4' },
  });
  assert.equal(st.done, true);
  assert.equal(st.failed, false);
  assert.equal(st.url, 'https://cdn.example/v.mp4');
});

test('parseAvatarStatus: flat processing shape → neither done nor failed', () => {
  const st = parseAvatarStatus({ status: 'processing' });
  assert.equal(st.done, false);
  assert.equal(st.failed, false);
});

test('parseAvatarStatus: failure shapes', () => {
  assert.equal(parseAvatarStatus({ data: { status: 'failed' } }).failed, true);
  assert.equal(parseAvatarStatus({ status: 'error' }).failed, true);
});

test('parseAvatarStatus: tolerant of videoUrl / download_url / url keys', () => {
  assert.equal(parseAvatarStatus({ status: 'completed', videoUrl: 'a' }).url, 'a');
  assert.equal(parseAvatarStatus({ status: 'completed', download_url: 'b' }).url, 'b');
  assert.equal(parseAvatarStatus({ status: 'completed', url: 'c' }).url, 'c');
});

test('spendEstimateUsd: reads SPEND_ESTIMATE_* env, observability only', () => {
  process.env.SPEND_ESTIMATE_VEO = '0.50';
  assert.equal(spendEstimateUsd('VEO'), 0.5);
  delete process.env.SPEND_ESTIMATE_VEO;

  // unset → 0, garbage → 0, negative → 0 (never used for enforcement anyway)
  assert.equal(spendEstimateUsd('VEO'), 0);
  process.env.SPEND_ESTIMATE_VEO = 'not-a-number';
  assert.equal(spendEstimateUsd('VEO'), 0);
  delete process.env.SPEND_ESTIMATE_VEO;
  process.env.SPEND_ESTIMATE_VEO = '-5';
  assert.equal(spendEstimateUsd('VEO'), 0);
  delete process.env.SPEND_ESTIMATE_VEO;
});
