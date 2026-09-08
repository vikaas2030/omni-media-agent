import { env, sleep, downloadVideo } from './util.js';

/**
 * Seedance (ByteDance) via the BytePlus ModelArk content-generations API:
 * 1. POST create a generation task with the prompt
 * 2. poll the task until succeeded
 * 3. download the produced video URL
 * ByteDance's OWN quotas/fees apply — our software never meters anything.
 */
export async function generateWithSeedance(prompt: string): Promise<string> {
  const key = env('SEEDANCE_API_KEY');
  const base = env('SEEDANCE_BASE_URL') || 'https://ark.ap-southeast.bytepluses.com';
  const model = env('SEEDANCE_MODEL') || 'seedance-1-0-lite-8';
  if (!key) throw new Error('SEEDANCE_API_KEY missing');

  const create = await fetch(`${base}/api/v3/contents/generations/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      content: [
        {
          type: 'text',
          text: `${prompt} --ratio 16:9 --duration 10`,
        },
      ],
    }),
  });
  if (!create.ok) {
    throw new Error(`Seedance task creation failed: HTTP ${create.status} ${await create.text()}`);
  }
  const { id } = (await create.json()) as { id: string };
  if (!id) throw new Error('Seedance returned no task id');

  interface SeedanceTask {
    status?: string;
    error?: { message?: string };
    content?: { video_url?: string };
  }
  let task: SeedanceTask | null = null;
  for (let i = 0; i < 60; i++) {
    await sleep(5_000);
    const poll = await fetch(`${base}/api/v3/contents/generations/tasks/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!poll.ok) continue;
    task = (await poll.json()) as SeedanceTask;
    if (task?.status === 'succeeded' || task?.status === 'failed') break;
  }
  if (task?.status !== 'succeeded') {
    throw new Error(task?.error?.message ?? `Seedance task did not succeed (status: ${task?.status ?? 'unknown'})`);
  }
  const videoUrl = task.content?.video_url;
  if (!videoUrl) throw new Error('Seedance succeeded but returned no video URL');

  return downloadVideo(videoUrl);
}
