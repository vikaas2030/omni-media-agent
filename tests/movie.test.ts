import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScreenplay } from '../src/movie/screenplay.js';
import { planShots } from '../src/movie/director.js';

const SCREENPLAY = `# MOVIE: भीष्म — The Terrible Vow
# CAST: DEVAVRATA (young warrior prince in golden armor), DASHARAJ (old fisherman chief, weathered face)

## SCENE 1: THE VOW
SETTING: A fisherman's riverside hut at dusk, firelight on tense faces
ACTION: Devavrata raises his palm holding sacred water, lightning splits the sky

DEVAVRATA (fierce, resolute): मैं जन्म से मृत्यु तक ब्रह्मचारी रहूँगा!
DASHARAJ (shaken): ...ऐसी भीषण प्रतिज्ञा!
NARRATOR: और इसी पल इतिहास बदल गया।
`;

test('parseScreenplay extracts title, cast, scenes, dialogue with emotion', () => {
  const sp = parseScreenplay(SCREENPLAY);
  assert.equal(sp.title, 'भीष्म — The Terrible Vow');
  assert.equal(sp.cast.length, 2);
  assert.equal(sp.cast[0].name, 'DEVAVRATA');
  assert.match(sp.cast[0].description, /golden armor/);
  assert.equal(sp.scenes.length, 1);
  assert.match(sp.scenes[0].setting, /riverside hut/);
  assert.match(sp.scenes[0].action, /lightning/);
  assert.equal(sp.scenes[0].lines.length, 3);
  const deva = sp.scenes[0].lines[0];
  assert.equal(deva.character, 'DEVAVRATA');
  assert.match(deva.emotion, /fierce/);
  assert.equal(deva.isNarration, false);
  assert.equal(sp.scenes[0].lines[2].isNarration, true);
});

test('parseScreenplay ignores unknown speakers and garbage lines', () => {
  const messy = `# MOVIE: T
# CAST: A (desc)

## SCENE 1: X
SETTING: a place
ACTION: something happens

A (calm): hello
INTRUDER: I am not in the cast, skip me
random garbage line 123
`;
  const sp = parseScreenplay(messy);
  const chars = sp.scenes[0].lines.map((l) => l.character);
  assert.deepEqual(chars, ['A']); // INTRUDER + garbage dropped
});

test('planShots: establishing + action + one animated shot per spoken line', () => {
  const sp = parseScreenplay(SCREENPLAY);
  const shots = planShots(sp);
  // scene has: 1 establishing + 1 action + 3 dialogue lines
  assert.equal(shots.length, 5);
  assert.equal(shots.filter((s) => s.kind === 'establishing').length, 1);
  assert.equal(shots.filter((s) => s.kind === 'action').length, 1);
  assert.equal(shots.filter((s) => s.kind === 'dialogue').length, 3);

  const devaShot = shots.find((s) => s.character === 'DEVAVRATA')!;
  assert.match(devaShot.imagePrompt, /young warrior prince in golden armor/);
  assert.match(devaShot.imagePrompt, /fierce/);
  assert.match(devaShot.motionPrompt, /character speaks/);
  assert.ok(devaShot.estSeconds >= 3 && devaShot.estSeconds <= 20);

  const narr = shots.find((s) => s.character === 'NARRATOR')!;
  assert.match(narr.motionPrompt, /slow pan/);
  assert.equal(narr.line, 'और इसी पल इतिहास बदल गया।');
});
