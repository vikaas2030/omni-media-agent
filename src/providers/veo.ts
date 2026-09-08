import { env, sleep, downloadVideo } from './util.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Google Veo via the Gemini API long-running pattern:
 * 1. POST models/{model}:predictLongRunning → operation name
 * 2. poll the operation until done
 * 3. download the generated video
 * Google's OWN quotas/fees apply — our software never meters anything.
 */
export async function generateWithVeo(prompt: string): Promise<string> {
  const key = env('VEO_API_KEY');
  const model = env('VEO_MODEL') || 'veo-3.0-generate-001';
  if (!key) throw new Error('VEO_API_KEY missing');

  const start = await fetch(`${BASE}/models/${model}:predictLongRunning?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { aspectRatio: '16:9', durationSeconds: 8 },
    }),
  });
  if (!start.ok) {
    throw new Error(`Veo start failed: HTTP ${start.status} ${await start.text()}`);
  }
  const { name } = (await start.json()) as { name: string };
  if (!name) throw new Error('Veo returned no operation name');

  // Poll the long-running operation (up to ~10 minutes)
  interface VeoOperation {
    done?: boolean;
    error?: { message: string };
    response?: {
      generateVideoResponse?: {
        generatedSamples?: { video?: { uri?: string } }[];
      };
      generatedVideos?: { video?: { uri?: string } }[];
    };
  }
  let op: VeoOperation | null = null;
  for (let i = 0; i < 60; i++) {
    await sleep(10_000);
    const poll = await fetch(`${BASE}/${name}?key=${key}`);
    if (!poll.ok) continue;
    op = (await poll.json()) as VeoOperation;
    if (op?.done) break;
  }
  if (!op?.done) throw new Error(op?.error?.message ?? 'Veo operation timed out');

  const uri =
    op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ??
    op.response?.generatedVideos?.[0]?.video?.uri;
  if (!uri) throw new Error('Veo completed but returned no video URI');

  return downloadVideo(uri, key);
}
