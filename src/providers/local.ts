import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { Provider, GenerationRequest, GenerationResult } from '../core/types.js';
import { ComfyUiProvider } from './comfyui.js';

const exec = promisify(execFile);

const env = (k: string, d: string) => process.env[k] ?? d;

async function binaryOk(cmd: string, versionFlag = '-version'): Promise<boolean> {
  try {
    await exec(cmd, [versionFlag], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Run a binary feeding text via stdin (execFile typings don't expose `input`). */
function runWithStdin(cmd: string, args: string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    child.stdin.on('error', reject);
    child.stdin.end(input);
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))
    );
  });
}

async function ollamaHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${env('OLLAMA_BASE_URL', 'http://ollama:11434')}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

/** LLM via Ollama — fully local, unlimited. */
class OllamaProvider implements Provider {
  id = 'local:ollama';
  modality = 'llm' as const;
  type = 'local' as const;
  health = ollamaHealth;

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const res = await fetch(`${env('OLLAMA_BASE_URL', 'http://ollama:11434')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env('OLLAMA_MODEL', 'llama3.1'),
        prompt: String(req.input),
        stream: false,
        ...(req.options ?? {}),
      }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = (await res.json()) as { response: string };
    return {
      text: data.response,
      providerId: this.id,
      providerType: 'local',
      fallbackChainUsed: [],
      warnings: [],
    };
  }
}

/** STT via whisper.cpp — local, unlimited. Requires WHISPER_MODEL path. */
class WhisperProvider implements Provider {
  id = 'local:whisper';
  modality = 'stt' as const;
  type = 'local' as const;
  health = async () => {
    const model = env('WHISPER_MODEL', '/models/whisper/ggml-base.bin');
    return (await binaryOk(env('WHISPER_CPP_PATH', 'whisper-cli'), '--help')) && existsSync(model);
  };

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const model = env('WHISPER_MODEL', '/models/whisper/ggml-base.bin');
    const outPrefix = `/tmp/whisper-${Date.now()}`;
    await exec(env('WHISPER_CPP_PATH', 'whisper-cli'), [
      '-m', model,
      '-f', String(req.input),
      '-of', outPrefix,
      '-otxt',
      '-l', String((req.options?.language as string) ?? 'auto'),
    ]);
    const text = readFileSync(`${outPrefix}.txt`, 'utf-8').trim();
    return {
      text,
      providerId: this.id,
      providerType: 'local',
      fallbackChainUsed: [],
      warnings: [],
    };
  }
}

/** TTS via Piper — local, unlimited. Text arrives on stdin. */
class PiperProvider implements Provider {
  id = 'local:piper';
  modality = 'tts' as const;
  type = 'local' as const;
  health = () => binaryOk(env('PIPER_PATH', 'piper'), '--help');

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const out = `/tmp/piper-${Date.now()}.wav`;
    await runWithStdin(env('PIPER_PATH', 'piper'), [
      '--model',
      env('PIPER_VOICE', '/voices/en_IN-medium.onnx'),
      '--output_file',
      out,
    ], String(req.input));
    return {
      artifactPath: out,
      providerId: this.id,
      providerType: 'local',
      fallbackChainUsed: [],
      warnings: [],
    };
  }
}

/** FFmpeg assembly/animation — the unlimited local render floor. */
class FfmpegAnimProvider implements Provider {
  id = 'local:ffmpeg-anim';
  modality = 'video' as const;
  type = 'local' as const;
  health = () => binaryOk(env('FFMPEG_PATH', 'ffmpeg'));
  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const out = `/tmp/anim-${Date.now()}.mp4`;
    // Ken-Burns style animation from stills — the always-available local video floor.
    await exec(env('FFMPEG_PATH', 'ffmpeg'), [
      '-y',
      '-loop', '1', '-i', String(req.input),
      '-vf', 'zoompan=z=\'min(zoom+0.0015,1.5)\':d=250:s=1920x1080',
      '-t', '10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out,
    ]);
    return {
      artifactPath: out,
      providerId: this.id,
      providerType: 'local',
      fallbackChainUsed: [],
      warnings: ['used local ffmpeg anim floor (no external video API)'],
    };
  }
}

export const localProviders: Provider[] = [
  new OllamaProvider(),
  new WhisperProvider(),
  new PiperProvider(),
  new ComfyUiProvider(),
  new FfmpegAnimProvider(),
];
