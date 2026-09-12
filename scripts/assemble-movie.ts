/**
 * Assembles the final film from worker-rendered clips (Drive bridge mode):
 * concat (+ silent-audio normalization) -> subtitles -> vertical shorts.
 *
 * Usage: node --import tsx scripts/assemble-movie.ts <screenplay> <clipsDir> <scenes> <outPrefix>
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, existsSync } from 'fs';
import { parseScreenplay } from '../src/movie/screenplay.js';
import { planShots } from '../src/movie/director.js';
import { buildSrt, SrtEntry } from '../src/movie/subtitles.js';
import { makeShorts, ShotTiming } from '../src/movie/shorts.js';

const exec = promisify(execFile);

async function probeDuration(path: string): Promise<number> {
  const out = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]);
  return parseFloat(out.stdout.trim()) || 0;
}

async function hasAudio(path: string): Promise<boolean> {
  try {
    const out = await exec('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', path]);
    return out.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function main() {
  const [screenplayPath, clipsDir, scenesArg, outPrefix] = process.argv.slice(2);
  const sp = parseScreenplay(readFileSync(screenplayPath, "utf8"));
  const scenes = Number(scenesArg ?? 99);
  const shots = planShots(sp).filter((s) => s.sceneIndex <= scenes);

  const clips: string[] = [];
  const timings: ShotTiming[] = [];
  const srtEntries: SrtEntry[] = [];
  let cursor = 0;

  for (const shot of shots) {
    const clip = `${clipsDir}/shot-${shot.id}.mp4`;
    if (!existsSync(clip)) throw new Error(`missing clip: ${clip}`);
    clips.push(clip);
    const dur = await probeDuration(clip);
    timings.push({
      id: shot.id, kind: shot.kind, character: shot.character,
      emotion: shot.emotion, line: shot.line, start: cursor, end: cursor + dur,
    });
    if (shot.line) srtEntries.push({ start: cursor, end: cursor + dur, character: shot.character, line: shot.line });
    cursor += dur;
  }

  // normalize silent clips (I2V has no audio track), then concat
  const norm: string[] = [];
  for (const c of clips) {
    if (await hasAudio(c)) { norm.push(c); continue; }
    const n = `/tmp/asm-silent-${Date.now()}.mp4`;
    await exec('ffmpeg', ['-y', '-v', 'error', '-i', c, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-map', '0:v', '-map', '1:a', '-shortest', '-c:v', 'copy', '-c:a', 'aac', n]);
    norm.push(n);
  }
  const list = `/tmp/asm-list-${Date.now()}.txt`;
  writeFileSync(list, norm.map((c) => `file '${c}'`).join('\n'));
  const finalPath = `${outPrefix}.mp4`;
  await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-c:a', 'aac', '-movflags', '+faststart', finalPath]);

  const srtPath = `${outPrefix}.srt`;
  writeFileSync(srtPath, buildSrt(srtEntries));

  const shorts = await makeShorts(finalPath, timings, { minSeconds: 3, maxSeconds: 12, count: 3 });

  const total = await probeDuration(finalPath);
  console.log(`FINAL: ${finalPath} (${(total / 60).toFixed(1)} min, ${clips.length} shots)`);
  console.log(`SUBS : ${srtPath}`);
  console.log(`SHORTS: ${shorts.length} -> ${shorts.join(', ')}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
