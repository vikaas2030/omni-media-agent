/**
 * Lip-sync — FREE, open-source, runs locally.
 * Engines (pick via LIPSYNC_ENGINE):
 *   wav2lip    — python3 $WAV2LIP_SCRIPT --face <video> --audio <audio> (any GPU, even CPU)
 *   latentsync — $LATENTSYNC_SCRIPT -v <video> -a <audio> (higher quality, needs GPU)
 *   off        — voice-over only (no lip movement) — honest fallback, never fake
 * If the engine is missing, we mux the voice over the animated shot and say so.
 */

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { accessSync, constants } from 'fs';

const exec = promisify(execFile);
const env = (k: string, d: string) => process.env[k] ?? d;

export interface LipSyncResult {
  path: string;
  engine: string; // 'wav2lip' | 'latentsync' | 'voiceover'
  warning?: string;
}

async function muxVoice(videoPath: string, audioPath: string): Promise<string> {
  const out = `/tmp/omni-vo-${Date.now()}.mp4`;
  await exec('ffmpeg', ['-y', '-v', 'error', '-i', videoPath, '-i', audioPath,
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest', out]);
  return out;
}

function exists(p: string): boolean {
  try { accessSync(p, constants.X_OK); return true; } catch { return false; }
}

export async function lipSync(videoPath: string, audioPath: string): Promise<LipSyncResult> {
  const engine = env('LIPSYNC_ENGINE', 'off').toLowerCase();

  if (engine === 'wav2lip' || engine === 'latentsync') {
    const script = engine === 'wav2lip' ? env('WAV2LIP_SCRIPT', '/opt/Wav2Lip/inference.py') : env('LATENTSYNC_SCRIPT', '/opt/LatentSync/inference.py');
    if (exists(script)) {
      try {
        const outDir = `/tmp/omni-lipsync-${Date.now()}`;
        const args = engine === 'wav2lip'
          ? ['--face', videoPath, '--audio', audioPath, '--outfile', outDir, '--pads', '0', '20', '0', '0']
          : ['-v', videoPath, '-a', audioPath, '-o', outDir];
        const cmd = engine === 'wav2lip' ? 'python3' : script;
        const finalArgs = engine === 'wav2lip' ? [script, ...args] : args;
        await exec(cmd, finalArgs, { timeout: 15 * 60 * 1000 });
        // Wav2Lip writes <outfile>/result_voice.mp4; LatentSync writes the named output.
        const { readdirSync } = await import('fs');
        const files = readdirSync(outDir).filter((f) => /\.(mp4|webm)$/i.test(f));
        if (files.length > 0) {
          // re-encode to a clean mp4 with faststart
          const out = `/tmp/omni-lip-${Date.now()}.mp4`;
          await exec('ffmpeg', ['-y', '-v', 'error', '-i', `${outDir}/${files[0]}`,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-c:a', 'aac', '-movflags', '+faststart', out]);
          return { path: out, engine };
        }
      } catch (err) {
        // fall through to voice-over with an honest warning
        const path = await muxVoice(videoPath, audioPath);
        return { path, engine: 'voiceover', warning: `${engine} failed (${(err as Error).message}) — voice-over only` };
      }
    }
    const path = await muxVoice(videoPath, audioPath);
    return { path, engine: 'voiceover', warning: `${engine} script not found at ${script} — voice-over only, no lip movement` };
  }

  const path = await muxVoice(videoPath, audioPath);
  return { path, engine: 'voiceover', warning: 'LIPSYNC_ENGINE=off — voice plays over the animated shot without lip movement' };
}
