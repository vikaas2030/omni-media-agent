/**
 * Post-production polish — FREE, open-source:
 *  - RIFE frame interpolation: Wan animates at 16fps; RIFE smooths it to 25/30fps
 *  - Real-ESRGAN upscale: 720p Wan output → 1080p+ (crisper faces, no paid upscaler)
 * Both are optional local binaries (env-configured). If missing, the clip
 * passes through with an honest warning — never a silent quality lie.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const exec = promisify(execFile);
const env = (k: string, d: string) => process.env[k] ?? d;

export interface PolishResult {
  path: string;
  applied: string[];
  warnings: string[];
}

function runnable(p: string): boolean {
  try { existsSync(p); return p.length > 0; } catch { return false; }
}

export async function polishClip(
  clipPath: string,
  opts: { interpolate?: boolean; upscale?: boolean } = {}
): Promise<PolishResult> {
  const applied: string[] = [];
  const warnings: string[] = [];
  let path = clipPath;

  const wantInterp = opts.interpolate ?? true;
  const wantUpscale = opts.upscale ?? true;

  // 1. RIFE: 16fps → 25fps (or current → target)
  const rife = env('RIFE_SCRIPT', '');
  if (wantInterp) {
    if (rife && existsSync(rife)) {
      try {
        const outDir = `/tmp/omni-rife-${Date.now()}`;
        await exec('python3', [rife, '-i', path, '-o', outDir, '--fps', '25'], { timeout: 10 * 60 * 1000 });
        const { readdirSync } = await import('fs');
        const files = readdirSync(outDir).filter((f) => /\.(mp4|webm)$/i.test(f));
        if (files.length > 0) {
          path = `${outDir}/${files[0]}`;
          applied.push('rife-25fps');
        }
      } catch (err) {
        warnings.push(`RIFE failed (${(err as Error).message}) — kept original fps`);
      }
    } else {
      warnings.push('RIFE_SCRIPT not set — animation stays at native fps');
    }
  }

  // 2. Real-ESRGAN: upscale x2 → then ffmpeg to clean 1080p mp4
  const esrgan = env('ESRGAN_BIN', '');
  if (wantUpscale) {
    if (esrgan && runnable(esrgan)) {
      try {
        const raw = `/tmp/omni-esrgan-${Date.now()}`;
        await exec(esrgan, ['-i', path, '-o', raw, '-s', '2', '-n', 'realesr-animevideov3'], { timeout: 10 * 60 * 1000 });
        const { readdirSync } = await import('fs');
        const files = readdirSync(raw).filter((f) => /\.(mp4|webm)$/i.test(f));
        if (files.length > 0) {
          const out = `/tmp/omni-1080-${Date.now()}.mp4`;
          await exec('ffmpeg', ['-y', '-v', 'error', '-i', `${raw}/${files[0]}`,
            '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'fast', '-crf', '21',
            '-c:a', 'aac', '-movflags', '+faststart', out]);
          path = out;
          applied.push('esrgan-1080p');
        }
      } catch (err) {
        warnings.push(`Real-ESRGAN failed (${(err as Error).message}) — kept original resolution`);
      }
    } else {
      warnings.push('ESRGAN_BIN not set — clip stays at native resolution');
    }
  }

  return { path, applied, warnings };
}
