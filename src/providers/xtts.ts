/**
 * XTTS v2 (Coqui) — FREE local TTS with real Hindi support and expressive
 * voice via speaker reference. Runs as the `xtts` docker-compose service
 * (Coqui XTTS server) or any XTTS_SERVER_URL.
 * Emotional delivery comes from the text itself + the reference speaker's
 * style; per-character voices are chosen via MOVIE_VOICE_<NAME> env paths.
 */

import { writeFileSync } from 'fs';
import { Provider, GenerationRequest, GenerationResult } from '../core/types.js';

const env = (k: string, d: string) => process.env[k] ?? d;
const BASE = () => env('XTTS_SERVER_URL', 'http://xtts:8020');

export class XttsProvider implements Provider {
  id = 'local:xtts';
  modality = 'tts' as const;
  type = 'local' as const;

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE()}/health`);
      return res.ok;
    } catch {
      // some builds expose / instead of /health
      try {
        const res = await fetch(`${BASE()}/`);
        return res.status < 500;
      } catch {
        return false;
      }
    }
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const text = String(req.input ?? '');
    if (!text.trim()) throw new Error('tts input is empty');
    const voice = String(req.options?.voice ?? 'narrator');
    // per-character speaker reference: MOVIE_VOICE_DEVAVRATA=/voices/dev.m4a
    const speakerWav = env(`MOVIE_VOICE_${voice.replace(/[^A-Z0-9_]/gi, '_').toUpperCase()}`, '') ||
      env('XTTS_DEFAULT_SPEAKER', '');

    const res = await fetch(`${BASE()}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        language: env('XTTS_LANGUAGE', 'hi'),
        voice, // character name — lets the server pick a per-character voice (e.g. edge-tts mode)
        ...(speakerWav ? { speaker_wav: speakerWav } : {}),
      }),
    });
    if (!res.ok) throw new Error(`XTTS HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const out = `/tmp/omni-xtts-${Date.now()}.wav`;
    writeFileSync(out, buf);
    return {
      artifactPath: out,
      providerId: this.id,
      providerType: 'local',
      fallbackChainUsed: [this.id],
      warnings: ['LOCAL — Unlimited by our software'],
      externalCostUsd: 0,
    };
  }
}
