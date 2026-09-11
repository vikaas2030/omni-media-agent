import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScreenplayText, writerPrompt } from '../src/movie/writer.js';
import { pickShorts, ShotTiming } from '../src/movie/shorts.js';
import { buildSrt, srtTime } from '../src/movie/subtitles.js';

const VALID = `# MOVIE: T
# CAST: A (a warrior), B (a chief)

## SCENE 1: X
SETTING: a hut at dusk
ACTION: A raises his palm

A (fierce): मैं प्रतिज्ञा लेता हूँ!
NARRATOR: इतिहास बदल गया।
`;

test('validateScreenplayText accepts a clean screenplay', () => {
  const v = validateScreenplayText(VALID);
  assert.equal(v.ok, true);
  // tolerant of markdown fences
  assert.equal(validateScreenplayText('```\\n' + VALID + '```').ok, true);
});

test('validateScreenplayText flags missing setting/dialogue', () => {
  const bad = `# MOVIE: T
# CAST: A (x)

## SCENE 1: X
ACTION: nothing spoken here
`;
  const v = validateScreenplayText(bad);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.includes('SETTING')));
  assert.ok(v.issues.some((i) => i.includes('no dialogue')));
});

test('writerPrompt embeds format, hook rule and target scene count', () => {
  const p = writerPrompt('भीष्म की प्रतिज्ञा', { minutes: 2 });
  assert.match(p, /## SCENE 1:/);
  assert.match(p, /HOOK/);
  assert.match(p, /6 scenes/);
  assert.match(p, /Hindi/);
});

test('pickShorts chooses emotional dialogue windows, capped and non-overlapping', () => {
  const t: ShotTiming[] = [
    { id: 1, kind: 'establishing', start: 0, end: 4 },
    { id: 2, kind: 'dialogue', character: 'A', emotion: 'calm', line: 'short line', start: 4, end: 24 },
    { id: 3, kind: 'dialogue', character: 'B', emotion: 'fierce, vow', line: 'a very dramatic long line about the terrible vow', start: 24, end: 52 },
    { id: 4, kind: 'dialogue', character: 'A', emotion: 'shout', line: 'another strong line worth clipping', start: 52, end: 78 },
    { id: 5, kind: 'action', start: 78, end: 84 },
  ];
  const picks = pickShorts(t, { count: 2, maxSeconds: 40 });
  assert.equal(picks.length, 2);
  for (const p of picks) {
    assert.ok(p.end - p.start >= 20);
    assert.ok(p.end - p.start <= 40);
  }
  // windows must not overlap
  const sorted = [...picks].sort((a, b) => a.start - b.start);
  assert.ok(sorted[0].end <= sorted[1].start);
  // establishing/action shots never become shorts
  assert.ok(picks.every((p) => p.kind === 'short'));
});

test('buildSrt formats timecodes and speaker names', () => {
  const srt = buildSrt([
    { start: 0, end: 2.5, character: 'A', line: 'नमस्ते' },
    { start: 2.5, end: 5, character: 'NARRATOR', line: 'कहानी' },
  ]);
  assert.match(srt, /1\n00:00:00,000 --> 00:00:02,500\nA: नमस्ते/);
  assert.match(srt, /2\n00:00:02,500 --> 00:00:05,000\nकहानी/); // narrator: no prefix
  assert.equal(srtTime(3661.5), '01:01:01,500');
});
