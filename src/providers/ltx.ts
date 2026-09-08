import { env, sleep, downloadVideo } from './util.js';

/**
 * LTX-Video (Lightricks) via the fal.ai queue API:
 * 1. POST the prompt to queue.fal.run → status_url / response_url
 * 2. poll status_url until COMPLETED
 * 3. fetch response_url → download the video
 * fal.ai's OWN quotas/fees apply — our software never meters anything.
 */
export async function generateWithLtx(prompt: string): Promise<string> {
  const key = env('LTX_API_KEY'); // your fal.ai key
  const model = env('LTX_MODEL') || 'fal-ai/ltx-video';
  if (!key) throw new Error('LTX_API_KEY missing (fal.ai key)');

  const submit = await fetch(`https://queue.fal.run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      negative_prompt: 'blurry, low quality, watermark',
    }),
  });
  if (!submit.ok) {
    throw new Error(`LTX submit failed: HTTP ${submit.status} ${await submit.text()}`);
  }
  const queued = (await submit.json()) as {
    status_url?: string;
    response_url?: string;
    request_id?: string;
  };
  if (!queued.status_url || !queued.response_url) {
    throw new Error('LTX queue returned no status/response URL');
  }

  const auth = { Authorization: `Key ${key}` };
  for (let i = 0; i < 60; i++) {
    await sleep(5_000);
    const st = await fetch(queued.status_url, { headers: auth });
    if (!st.ok) continue;
    const data = (await st.json()) as { status?: string };
    if (data.status === 'COMPLETED') break;
    if (i === 59 && data.status !== 'COMPLETED') throw new Error(`LTX queue timed out (status: ${data.status})`);
  }

  const res = await fetch(queued.response_url, { headers: auth });
  if (!res.ok) throw new Error(`LTX response fetch failed: HTTP ${res.status}`);
  const payload = (await res.json()) as {
    video?: { url?: string };
    videos?: { url?: string }[];
  };
  const videoUrl = payload.video?.url ?? payload.videos?.[0]?.url;
  if (!videoUrl) throw new Error('LTX response contained no video URL');

  return downloadVideo(videoUrl);
}
