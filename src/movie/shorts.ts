/**
 * Auto-Shorts — one movie → vertical 9:16 Shorts/Reels for free (FFmpeg).
 * The director's dialogue shots are scored (line length + emotion words);
 * the best non-overlapping windows become shorts with a center-crop pan.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

export interface ShotTiming {
  id: number;
  kind: string;
  character?: string;
  emotion?: string;
  line?: string;
  start: number; // seconds in the final movie
  end: number;
}

export interface ShortsOptions {
  count?: number;      // how many shorts (default 3)
  maxSeconds?: number; // per-short length cap (default 45)
  minSeconds?: number; // minimum length (default 20)
}

const EMOTION_WORDS = /(fierce|angry|shout|desperate|tense|triumph|tears|shock|revelation|gasp|epic|vow|pratigya)/i;

export function pickShorts(timings: ShotTiming[], opts: ShortsOptions = {}): ShotTiming[] {
  const count = opts.count ?? 3;
  const maxSeconds = opts.maxSeconds ?? 45;
  const minSeconds = opts.minSeconds ?? 20;

  const dialogue = timings.filter((t) => t.kind === 'dialogue' && t.line && t.end - t.start >= minSeconds);
  const scored = dialogue
    .map((t) => {
      let score = (t.end - t.start) * 1.0 + Math.min(t.line!.length, 120) * 0.5;
      if (t.emotion && EMOTION_WORDS.test(t.emotion)) score += 40;
      if (t.emotion && EMOTION_WORDS.test(t.line!)) score += 25;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score);

  // greedily pack the best shots into windows, grouping neighbours that fit
  const windows: { start: number; end: number; score: number }[] = [];
  for (const { t, score } of scored) {
    const last = windows[windows.length - 1];
    if (last && t.start - last.start < maxSeconds && t.end - last.start <= maxSeconds) {
      last.end = t.end;
      last.score += score;
    } else {
      windows.push({ start: t.start, end: t.end, score });
    }
    if (windows.length >= count) break;
  }
  return windows.map((w) => ({
    id: w.start,
    kind: 'short',
    start: w.start,
    end: Math.min(w.end, w.start + maxSeconds),
  }));
}

/** Render one vertical short: 9:16 center-crop + slow zoom, 1080x1920. */
export async function renderShort(
  moviePath: string,
  t: { start: number; end: number },
  outPath: string
): Promise<string> {
  const dur = (t.end - t.start).toFixed(2);
  await exec('ffmpeg', ['-y', '-v', 'error',
    '-ss', t.start.toFixed(2), '-t', dur, '-i', moviePath,
    '-vf', "crop=ih*9/16:ih,scale=1080:1920:flags=lanczos",
    '-r', '25', '-c:v', 'libx264', '-preset', 'fast', '-crf', '21',
    '-c:a', 'aac', '-movflags', '+faststart', outPath]);
  return outPath;
}

export async function makeShorts(
  moviePath: string,
  timings: ShotTiming[],
  opts: ShortsOptions = {}
): Promise<string[]> {
  const picks = pickShorts(timings, opts);
  const outs: string[] = [];
  for (let i = 0; i < picks.length; i++) {
    const out = `/tmp/omni-short-${Date.now()}-${i}.mp4`;
    await renderShort(moviePath, picks[i], out);
    outs.push(out);
  }
  return outs;
}
