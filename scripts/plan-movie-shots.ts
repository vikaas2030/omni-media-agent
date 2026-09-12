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
const jobs = shots.map((s) => ({
  id: s.id,
  kind: s.kind,
  scene: s.sceneIndex,
  imagePrompt: s.imagePrompt,
  motionPrompt: s.motionPrompt,
  seconds: 4, // 65 frames @16fps — T4-safe per-shot render time
  line: s.line ?? null,
  character: s.character ?? null,
  emotion: s.emotion ?? null,
}));

writeFileSync(out, JSON.stringify(jobs, null, 1));
console.log(`${jobs.length} shot jobs -> ${out} (${sp.title}, scenes <= ${scenes})`);
