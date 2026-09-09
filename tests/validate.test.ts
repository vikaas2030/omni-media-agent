import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateScript,
  validateStoryboard,
  parseCritique,
  parseFfprobe,
} from '../src/core/validate.js';

const goodScript =
  'Sourdough is alive, and it fights back. ' +
  'Your starter rises because wild yeast eats flour sugar. ' +
  'Feed it equal weights flour and water every day. ' +
  'Look for bubbles and a pleasant sour smell. ' +
  'If it doubles in four hours, it is ready to bake with. ' +
  'Follow for more baking science every week.';

test('validateScript accepts a well-formed spoken script', () => {
  const v = validateScript(goodScript, 'youtube');
  assert.equal(v.ok, true);
  assert.deepEqual(v.issues, []);
});

test('validateScript rejects empty, short, placeholder and markdown output', () => {
  assert.equal(validateScript('', 'youtube').ok, false);
  assert.equal(validateScript(undefined, 'youtube').ok, false);

  const tooShort = validateScript('Bread is nice. Follow me.', 'youtube');
  assert.equal(tooShort.ok, false);
  assert.match(tooShort.issues.join(' '), /too short/i);

  const placeholder = validateScript(
    goodScript + ' [insert joke here]', 'youtube'
  );
  assert.equal(placeholder.ok, false);
  assert.match(placeholder.issues.join(' '), /placeholder/i);

  const md = validateScript('## Intro\n' + goodScript, 'youtube');
  assert.equal(md.ok, false);
  assert.match(md.issues.join(' '), /markdown/i);

  const ramblingHook = validateScript(
    'Well you know one of the most interesting things about sourdough is fermentation and ' + goodScript,
    'youtube'
  );
  assert.equal(ramblingHook.ok, false);
  assert.match(ramblingHook.issues.join(' '), /hook/i);
});

test('validateStoryboard checks shot count via the real parser', () => {
  const board = [
    'Shot 1: macro of bubbling starter jar on warm, airy kitchen counter on-screen: Alive',
    'Shot 2: hands folding flour into the jar, over-shoulder framing on-screen: Feed daily',
    'Shot 3: time-lapse of dough rising beside a sunny window on-screen: Watch it double',
    'Shot 4: loaf pulled from oven, steam curling into the light on-screen: Bake day',
    'Shot 5: crumb shot of sliced loaf, slow push-in on-screen: Real bread',
    'Shot 6: creator smiling with the loaf in a cozy kitchen on-screen: Follow',
  ].join('\n');
  const ok = validateStoryboard(board, 'youtube');
  assert.equal(ok.ok, true);

  const tooFew = validateStoryboard('Bread. Dough. Oven.', 'youtube');
  assert.equal(tooFew.ok, false);
  assert.match(tooFew.issues.join(' '), /shots/);

  assert.equal(validateStoryboard('', 'youtube').ok, false);
});

test('parseCritique extracts JSON from messy LLM output and clamps scores', () => {
  const clean = parseCritique('{"score": 8, "issues": ["hook could be tighter"]}');
  assert.ok(clean);
  assert.equal(clean!.score, 8);
  assert.equal(clean!.issues.length, 1);

  const messy = parseCritique('Sure! Here is my review:\n\n{"score": 6.5, "issues": []}\nThanks!');
  assert.ok(messy);
  assert.equal(messy!.score, 6.5);

  const clamped = parseCritique('{"score": 42, "issues": []}');
  assert.equal(clamped!.score, 10);

  assert.equal(parseCritique('no json at all, sorry'), null);
  assert.equal(parseCritique('{"issues": []}'), null); // missing score
  assert.equal(parseCritique(undefined), null);
});

test('parseFfprobe reads streams and duration', () => {
  const json = JSON.stringify({
    streams: [
      { codec_type: 'video', width: 1920, height: 1080, duration: 61.2 },
      { codec_type: 'audio', codec_name: 'aac' },
    ],
    format: { duration: '61.2' },
  });
  const info = parseFfprobe(json);
  assert.ok(info);
  assert.equal(info!.hasVideo, true);
  assert.equal(info!.hasAudio, true);
  assert.equal(info!.width, 1920);
  assert.equal(info!.height, 1080);
  assert.equal(info!.durationSeconds, 61.2);

  // audio-only file → no video stream → null
  assert.equal(parseFfprobe('{"streams":[{"codec_type":"audio"}]}'), null);
  assert.equal(parseFfprobe('not json'), null);
});
