/**
 * Movie Mode pipeline — a real animated film from a screenplay, using ONLY
 * free local/open-source resources. `allowExternal: false` is not an option
 * here; it's the point: characters speak (TTS + lip-sync), scenes move
 * (local I2V animation), and no paid API is ever contacted.
 *
 * screenplay → shots → stills (ComfyUI/SDXL) → animation (ComfyUI/Wan I2V)
 *   → dialogue TTS (XTTS Hindi) → lip-sync (Wav2Lip/LatentSync)
 *   → FFmpeg assembly (+ optional free background music)
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { generate } from '../core/router.js';
import type { Registry } from '../core/registry.js';
import { parseScreenplay } from './screenplay.js';
import { planShots, MovieShot } from './director.js';
import { lipSync } from './lipsync.js';

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
  title: string;
  totalShots: number;
  spokenShots: number;
  log: string[];
}

async function concatClips(clips: string[], out: string): Promise<void> {
  const { writeFileSync } = await import('fs');
  const list = `/tmp/omni-movie-list-${Date.now()}.txt`;
  writeFileSync(list, clips.map((c) => `file '${c}'`).join('\n'));
  await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-c:a', 'aac', '-movflags', '+faststart', out]);
}

export async function runMovie(job: MovieJob, registry: Registry): Promise<MovieResult> {
  const log: string[] = [];
  const sp = parseScreenplay(job.screenplay);
  const shots: MovieShot[] = planShots(sp, job.style);
  log.push(`"${sp.title}" — ${sp.scenes.length} scenes, ${shots.length} shots planned`);

  const clips: string[] = [];
  let spoken = 0;

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
    if (shot.line) {
      const tts = await generate({
        modality: 'tts',
        input: shot.line,
        options: { voice: shot.character ?? 'narrator', emotion: shot.emotion },
        allowExternal: false,
      }, registry);
      const lip = await lipSync(anim.artifactPath!, tts.artifactPath!);
      clips.push(lip.path);
      spoken++;
      log.push(`shot ${shot.id}: ${shot.character} speaks — ${lip.engine}${lip.warning ? ` (${lip.warning})` : ''}`);
    } else {
      clips.push(anim.artifactPath!);
    }
  }

  // 4. Assembly
  const finalPath = `/tmp/omni-movie-${Date.now()}.mp4`;
  await concatClips(clips, finalPath);

  // 5. Optional free background music (user-provided, open-licensed)
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

  log.push(`FINAL: ${finalPath} — ${shots.length} shots, ${spoken} spoken`);
  return { finalPath, title: sp.title, totalShots: shots.length, spokenShots: spoken, log };
}
