import test from 'node:test';
import assert from 'node:assert/strict';
import { rightsPolicyCheck } from '../src/pipeline/rights-policy.js';

test('blocks unknown music source', () => {
  const r = rightsPolicyCheck({
    title: 't',
    script: 'hello world',
    musicSource: 'unknown',
    usesThirdPartyFootage: false,
    platform: 'youtube',
  });
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.toLowerCase().includes('music')));
});

test('blocks third-party footage without permission', () => {
  const r = rightsPolicyCheck({
    title: 't',
    script: 's',
    musicSource: 'licensed',
    usesThirdPartyFootage: true,
    platform: 'youtube',
  });
  assert.equal(r.passed, false);
});

test('warns on platform policy flags but still passes', () => {
  const r = rightsPolicyCheck({
    title: 't',
    script: 'This video is reused content, trust me',
    musicSource: 'royalty-free',
    usesThirdPartyFootage: false,
    platform: 'youtube',
  });
  assert.equal(r.passed, true);
  assert.ok(r.warnings.length > 0);
});

test('clean input passes with no issues or warnings', () => {
  const r = rightsPolicyCheck({
    title: 't',
    script: 'totally original',
    musicSource: 'licensed',
    usesThirdPartyFootage: false,
    platform: 'instagram',
  });
  assert.equal(r.passed, true);
  assert.equal(r.warnings.length, 0);
});
