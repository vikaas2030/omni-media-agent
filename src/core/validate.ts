/**
 * Output validation — quality can't be "best output" if it isn't even well-formed.
 * Pure functions where possible so they're trivially testable.
 */

import { parseStoryboard } from '../pipeline/storyboard-render.js';
import { platformPreset } from './prompts.js';

export interface Validation {
  ok: boolean;
  issues: string[];
}

export function validateScript(
  text: string | undefined,
  platform: string
): Validation {
  const issues: string[] = [];
  const t = (text ?? '').trim();
  const preset = platformPreset(platform);
  if (!t) return { ok: false, issues: ['script is empty'] };

  const words = t.split(/\s+/).filter(Boolean).length;
  if (words < 25) issues.push(`too short (${words} words — needs a real hook and at least 2 beats)`);
  if (words > Math.round(preset.maxWords * 1.4))
    issues.push(`too long (${words} words — target ${preset.maxWords} for ${preset.label})`);
  if (/\[\s*(insert|todo|placeholder|your |example)/i.test(t))
    issues.push('contains placeholder markers');
  if (/^#{1,6}\s|\*\*|^-\s/m.test(t))
    issues.push('contains markdown formatting — needs spoken-word text');
  const firstSentence = t.split(/[.!?\n]/)[0];
  if (firstSentence && firstSentence.split(/\s+/).filter(Boolean).length > 12)
    issues.push('opening sentence is not a hook (keep it under ~10 words)');

  return { ok: issues.length === 0, issues };
}

export function validateStoryboard(
  text: string | undefined,
  platform: string
): Validation {
  const issues: string[] = [];
  const t = (text ?? '').trim();
  if (!t) return { ok: false, issues: ['storyboard is empty'] };

  const shots = parseStoryboard(t);
  const preset = platformPreset(platform);
  if (shots.length < 3)
    issues.push(`only ${shots.length} shot(s) parsed — need 6-10 distinct shots`);
  if (shots.length > 15)
    issues.push(`${shots.length} shots — too many for ${preset.targetSeconds}s, trim to 6-10`);

  return { ok: issues.length === 0, issues };
}

/** Robustly extract the critique JSON from LLM output (models add prose). */
export function parseCritique(
  text: string | undefined
): { score: number; issues: string[] } | null {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const score = Number(parsed.score);
    if (!Number.isFinite(score)) return null;
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter((i: unknown) => typeof i === 'string').map(String)
      : [];
    return { score: Math.min(10, Math.max(1, score)), issues };
  } catch {
    return null;
  }
}

export interface MediaInfo {
  durationSeconds: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number;
  height: number;
}

/** Parse `ffprobe -show_format -show_streams -of json` output. */
export function parseFfprobe(json: string): MediaInfo | null {
  try {
    const d = JSON.parse(json);
    const streams: Array<Record<string, unknown>> = Array.isArray(d.streams) ? d.streams : [];
    const video = streams.find((s) => s.codec_type === 'video');
    const audio = streams.find((s) => s.codec_type === 'audio');
    if (!video) return null;
    const duration = Number(d.format?.duration ?? video.duration ?? 0);
    return {
      durationSeconds: Number.isFinite(duration) ? duration : 0,
      hasVideo: true,
      hasAudio: Boolean(audio),
      width: Number(video.width ?? 0),
      height: Number(video.height ?? 0),
    };
  } catch {
    return null;
  }
}

export interface RenderCheck {
  /** false = the render is genuinely broken; do not publish it. */
  ok: boolean;
  issues: string[];   // fatal
  warnings: string[]; // worth logging, not fatal
  info?: MediaInfo;
}

/**
 * Verify a rendered file is actually a publishable video: exists, has a video
 * stream, reasonable duration. ffprobe unavailable → skip (ok, with warning),
 * so environments without ffprobe still run; broken renders never pass.
 */
export async function ffprobeVerify(
  path: string,
  opts: { minSeconds?: number; requireAudio?: boolean; aspectRatio?: number } = {}
): Promise<RenderCheck> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const { accessSync, constants } = await import('fs');
  const exec = promisify(execFile);

  try {
    accessSync(path, constants.R_OK);
  } catch {
    return { ok: false, issues: [`rendered file missing or unreadable: ${path}`], warnings: [] };
  }

  let raw: string;
  try {
    const res = await exec(process.env.FFPROBE_PATH ?? 'ffprobe', [
      '-v', 'error',
      '-show_format',
      '-show_streams',
      '-of', 'json',
      path,
    ]);
    raw = res.stdout;
  } catch {
    return {
      ok: true,
      issues: [],
      warnings: ['ffprobe not available — render verification skipped'],
    };
  }

  const info = parseFfprobe(raw);
  if (!info) return { ok: false, issues: ['ffprobe could not read the render — file may be corrupt'], warnings: [] };

  const issues: string[] = [];
  const warnings: string[] = [];
  if (!info.hasVideo) issues.push('no video stream in render');
  if (info.durationSeconds <= 0) issues.push('render has zero duration');
  if (opts.minSeconds && info.durationSeconds > 0 && info.durationSeconds < opts.minSeconds)
    issues.push(`render is only ${info.durationSeconds.toFixed(1)}s — expected at least ${opts.minSeconds.toFixed(1)}s`);
  if (opts.requireAudio && !info.hasAudio)
    warnings.push('render has no audio stream although a voiceover was expected');
  if (opts.aspectRatio && info.width > 0 && info.height > 0) {
    const actual = info.width / info.height;
    if (Math.abs(actual - opts.aspectRatio) / opts.aspectRatio > 0.15)
      warnings.push(`render is ${info.width}x${info.height} (${actual.toFixed(2)}) — target aspect ${opts.aspectRatio.toFixed(2)}`);
  }

  return { ok: issues.length === 0, issues, warnings, info };
}
