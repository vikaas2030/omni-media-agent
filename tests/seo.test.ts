import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSeo } from '../src/pipeline/seo.js';

test('parses valid LLM JSON output', () => {
  const r = parseSeo(
    `{"title":"Local AI is the future","description":"Watch this now!","tags":["ai","local"],"hashtags":["#ai","#local"]}`,
    'fallback topic'
  );
  assert.equal(r.title, 'Local AI is the future');
  assert.deepEqual(r.tags, ['ai', 'local']);
});

test('falls back gracefully on garbage output', () => {
  const r = parseSeo('the LLM refused to answer in JSON', 'Omni Media Agent');
  assert.ok(r.title.length > 0);
  assert.ok(r.description.length > 0);
  assert.ok(Array.isArray(r.tags));
});

test('enforces max lengths from platform limits', () => {
  const longTitle = 'x'.repeat(120);
  const r = parseSeo(`{"title":"${longTitle}"}`, 'topic');
  assert.ok(r.title.length <= 60);
});
