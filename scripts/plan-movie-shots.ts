/**
 * Plans a movie into per-shot render jobs for the Colab Drive worker.
 * Output: JSON array — one job per shot (still + I2V + TTS + lip-sync).
 *
 * Usage: node --import tsx scripts/plan-movie-shots.ts <screenplay> [scenes] [out.json]
 */

import { readFileSync, writeFileSync } from 'fs';
import { parseScreenplay } from '../src/movie/screenplay.js';
import { planShots } from '../src/movie/director.js';

const sp = parseScreenplay(readFileSync(process.argv[2], 'utf8'));
const scenes = Number(process.argv[3] ?? 99);
const out = process.argv[4] ?? '/tmp/movie-jobs.json';

const shots = planShots(sp).filter((s) => s.sceneIndex <= scenes);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const jobs = shots.map((s) => ({
  id: s.id,
  kind: s.kind,
  scene: s.sceneIndex,
  imagePrompt: s.imagePrompt,
  motionPrompt: s.motionPrompt,
  // 81 frames @16fps max — T4-safe; dialogue covers its audio, loop handles the rest
  seconds: s.kind === 'dialogue' ? clamp(Math.ceil(s.estSeconds), 5, 8) : 5,
  line: s.line ?? null,
  character: s.character ?? null,
  emotion: s.emotion ?? null,
  quality: { fps: 32, height: 1080, lipsync: 'latentsync' },
}));

writeFileSync(out, JSON.stringify(jobs, null, 1));
console.log(`${jobs.length} shot jobs -> ${out} (${sp.title}, scenes <= ${scenes})`);
