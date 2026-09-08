import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStoryboard } from '../src/pipeline/storyboard-render.js';

test('parses shot lines and splits visual vs on-screen cue', () => {
  const shots = parseStoryboard(
    `Shot 1: city skyline at sunrise on-screen: OMNI MEDIA AGENT
Shot 2: team working in studio on-screen: 100% LOCAL. 0 CREDITS.`
  );
  assert.equal(shots.length, 2);
  assert.equal(shots[0].text, 'OMNI MEDIA AGENT');
  assert.equal(shots[0].visualDescription, 'city skyline at sunrise');
  assert.equal(shots[1].text, '100% LOCAL. 0 CREDITS.');
});

test('parses plain numbered lines without on-screen cues', () => {
  const shots = parseStoryboard(`1. First thing
2. Second thing`);
  assert.equal(shots.length, 2);
  assert.equal(shots[0].text, 'First thing');
});

test('falls back to sentences and caps output at 20 shots', () => {
  const text = Array.from({ length: 30 }, (_, i) => `Sentence number ${i}.`).join(' ');
  const shots = parseStoryboard(text);
  assert.equal(shots.length, 20);
});
