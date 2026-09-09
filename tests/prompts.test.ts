import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scriptPrompt,
  storyboardPrompt,
  critiquePrompt,
  refinePrompt,
  platformPreset,
  PLATFORM_PRESETS,
} from '../src/core/prompts.js';

test('scriptPrompt embeds topic, platform fit, hook rule and word budget', () => {
  const p = scriptPrompt('sourdough starters', 'instagram');
  assert.match(p, /sourdough starters/);
  assert.match(p, /Instagram Reels/);
  assert.match(p, /HOOK/i);
  assert.ok(p.includes('punchy')); // tone guide
  // exact same topic, different platform → different script rules
  const yt = scriptPrompt('sourdough starters', 'youtube');
  assert.notEqual(p, yt);
  assert.match(yt, /YouTube/);
  assert.match(yt, /75-second/);
});

test('storyboardPrompt pins the exact parseable format', () => {
  const p = storyboardPrompt('Some script text.', 'youtube');
  assert.match(p, /Shot N: \[visual description\] on-screen: \[short text cue\]/);
  assert.match(p, /6-10 shots/);
  assert.match(p, /Some script text\./);
});

test('critiquePrompt demands JSON-only output', () => {
  const p = critiquePrompt('script', 'the script', 'facebook');
  assert.match(p, /\{"score": <number 1-10>, "issues": \[/);
  assert.match(p, /ONLY with JSON/);
});

test('refinePrompt lists the feedback and keeps prior draft', () => {
  const p = refinePrompt('script', 'OLD DRAFT', ['weak hook', 'too long']);
  assert.match(p, /- weak hook/);
  assert.match(p, /- too long/);
  assert.match(p, /OLD DRAFT/);
});

test('platformPreset falls back to youtube for unknown platforms', () => {
  assert.equal(PLATFORM_PRESETS.youtube.label, platformPreset('youtube').label);
  assert.equal(PLATFORM_PRESETS.youtube.label, platformPreset('tiktok??').label);
  assert.equal(PLATFORM_PRESETS.youtube.label, platformPreset(undefined).label);
  assert.ok(PLATFORM_PRESETS.instagram.aspectRatio < 1); // portrait
});
