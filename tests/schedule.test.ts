import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePublishAt } from '../src/schedule.js';

test('parses explicit UTC ISO dates exactly', () => {
  const now = Date.UTC(2026, 8, 8, 12, 0, 0); // 2026-09-08T12:00:00Z
  const r = parsePublishAt('2026-09-09T18:00:00Z', now);
  assert.equal(r.utc.getTime(), Date.UTC(2026, 8, 9, 18, 0, 0));
  assert.equal(r.delayMs, 30 * 3600 * 1000);
});

test('interprets naive wall-clock as Asia/Kolkata (+05:30) by default', () => {
  const now = Date.UTC(2026, 8, 8, 12, 0, 0);
  const r = parsePublishAt('2026-09-09 18:00', now);
  // 18:00 IST == 12:30 UTC
  assert.equal(r.utc.getTime(), Date.UTC(2026, 8, 9, 12, 30, 0));
});

test('accepts explicit numeric zone offsets', () => {
  const now = Date.UTC(2026, 8, 8, 12, 0, 0);
  const r = parsePublishAt('2026-09-09T18:00:00+05:30', now);
  assert.equal(r.utc.getTime(), Date.UTC(2026, 8, 9, 12, 30, 0));
});

test('throws on past dates', () => {
  assert.throws(() => parsePublishAt('2020-01-01 00:00'));
});

test('throws on garbage', () => {
  assert.throws(() => parsePublishAt('next friday maybe'));
});
