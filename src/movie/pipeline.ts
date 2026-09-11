/**
 * Movie Mode pipeline — a real animated film from a screenplay, using ONLY
 * free local/open-source resources. `allowExternal: false` is not an option
 * here; it's the point: characters speak (TTS + lip-sync), scenes move
 * (local I2V animation), and no paid API is ever contacted.
 *
 * screenplay → shots → stills (ComfyUI/SDXL) → animation (ComfyUI/Wan I2V)
 *   → dialogue TTS (XTTS Hindi) → lip-sync (Wav2Lip/LatentSync)
 *   → polish (RIFE 25fps + Real-ESRGAN 1080p, if installed)
 *   → FFmpeg assembly (+ optional free background music)
 *   → subtitles (.srt) + optional Auto-Shorts (9:16)
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, writeFileSync } from 'fs';
import { generate } from '../core/router.js';
import type { Registry } from '../core/registry.js';
import { parseScreenplay } from './screenplay.js';
import { planShots, MovieShot } from './director.js';
import { lipSync } from './lipsync.js';
import { polishClip } from './polish.js';
import { buildSrt, SrtEntry } from './subtitles.js';
import { makeShorts, ShotTiming } from './shorts.js';

const exec = promisify(execFile);
const env = (k: string, d: string) => process.env[k] ?? d;

export interface MovieJob {
  screenplay: string;
  style?: string;
  /** free/open-licensed background music (path). None = no music, we never fake rights. */
  bgMusic?: string;
}

export interface MovieResult {
  finalPath?: string;
  srtPath?: string;
  shorts?: string[];
  title: string;
  totalShots: number;
  spokenShots: number;
  log: string[];
}

async function probeDuration(path: string): Promise<number> {
  const out = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]);
  return parseFloat(out.stdout.trim()) || 0;
}

async function concatClips(clips: string[], out: string): Promise<void> {
  const list = `/tmp/omni-movie-list-${Date.now()}.txt`;
  writeFileSync(list, clips.map((c) => `file '${c}'`).join('\n'));
  await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-c:a', 'aac', '-movflags', '+faststart', out]);
}

export async function runMovie(job: MovieJob, registry: Registry): Promise<MovieResult> {
  const log: string[] = [];
  const sp = parseScreenplay(job.screenplay);
  const shots: MovieShot[] = planShots(sp, job.style);
  const doPolish = env('MOVIE_POLISH', '1') === '1';
  log.push(`"${sp.title}" — ${sp.scenes.length} scenes, ${shots.length} shots planned`);

  const clips: string[] = [];
  const timings: ShotTiming[] = [];
  const srtEntries: SrtEntry[] = [];
  let spoken = 0;
  let cursor = 0; // seconds in the final movie

  for (const shot of shots) {
    // 1. Still frame (free local image model)
    const still = await generate({
      modality: 'image',
      input: shot.imagePrompt,
      options: { width: 1280, height: 720 },
      allowExternal: false,
    }, registry);
    log.push(`shot ${shot.id} (${shot.kind}): still via ${still.providerId}`);

    // 2. Animate the still (free local I2V — Wan/LTX in ComfyUI)
    const anim = await generate({
      modality: 'video',
      input: JSON.stringify({ imagePath: still.artifactPath, motionPrompt: shot.motionPrompt }),
      options: { seconds: shot.estSeconds, width: 1280, height: 720 },
      allowExternal: false, // NEVER a paid API in Movie Mode
    }, registry);
    log.push(`shot ${shot.id}: animated via ${anim.providerId}`);

    // 3. Speaking characters: TTS + lip-sync
    let clip = anim.artifactPath!;
    if (shot.line) {
      const tts = await generate({
        modality: 'tts',
        input: shot.line,
        options: { voice: shot.character ?? 'narrator', emotion: shot.emotion },
        allowExternal: false,
      }, registry);
      const lip = await lipSync(clip, tts.artifactPath!);
      clip = lip.path;
      spoken++;
      log.push(`shot ${shot.id}: ${shot.character} speaks — ${lip.engine}${lip.warning ? ` (${lip.warning})` : ''}`);
    }

    // 4. Polish (free open-source: RIFE 25fps + Real-ESRGAN 1080p) — optional
    if (doPolish) {
      const polished = await polishClip(clip);
      if (polished.applied.length > 0) {
        clip = polished.path;
        log.push(`shot ${shot.id}: polished (${polished.applied.join(', ')})`);
      } else {
        log.push(`shot ${shot.id}: polish skipped — ${polished.warnings[0] ?? 'no engines'}`);
      }
    }
    clips.push(clip);

    // 5. Track timings for subtitles + shorts
    const dur = await probeDuration(clip);
    timings.push({
      id: shot.id, kind: shot.kind, character: shot.character,
      emotion: shot.emotion, line: shot.line, start: cursor, end: cursor + dur,
    });
    if (shot.line) srtEntries.push({ start: cursor, end: cursor + dur, character: shot.character, line: shot.line });
    cursor += dur;
  }

  // 6. Assembly
  const finalPath = `/tmp/omni-movie-${Date.now()}.mp4`;
  await concatClips(clips, finalPath);

  // 7. Optional free background music (user-provided, open-licensed)
  const music = job.bgMusic ?? env('MOVIE_BG_MUSIC', '');
  if (music && existsSync(music)) {
    const withMusic = finalPath.replace(/\.mp4$/, '-m.mp4');
    await exec('ffmpeg', ['-y', '-v', 'error', '-i', finalPath, '-stream_loop', '-1', '-i', music,
      '-filter_complex', '[1:a]volume=0.18[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]',
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', withMusic]);
    const { renameSync } = await import('fs');
    renameSync(withMusic, finalPath);
    log.push('background music mixed in (open-licensed track)');
  }

  // 8. Subtitles (free — built from our own lines + timings)
  const srtPath = finalPath.replace(/\.mp4$/, '.srt');
  writeFileSync(srtPath, buildSrt(srtEntries));
  log.push(`subtitles: ${srtPath}`);

  // 9. Auto-Shorts (free vertical clips for Reels/Shorts)
  let shorts: string[] | undefined;
  if (env('MOVIE_MAKE_SHORTS', '0') === '1') {
    shorts = await makeShorts(finalPath, timings);
    log.push(`auto-shorts: ${shorts.length} vertical clips`);
  }

  log.push(`FINAL: ${finalPath} — ${shots.length} shots, ${spoken} spoken, ${(cursor / 60).toFixed(1)} min`);
  return { finalPath, srtPath, shorts, title: sp.title, totalShots: shots.length, spokenShots: spoken, log };
}
