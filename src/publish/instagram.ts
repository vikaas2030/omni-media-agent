import { basename } from 'path';
import { PublishPayload } from './publishers.js';

const env = (k: string) => (process.env[k] ?? '').trim();
const API = 'v21.0';

/**
 * Instagram Reels publish via the official Graph API:
 * 1. create a media container from a PUBLIC video URL
 * 2. poll container status until FINISHED
 * 3. publish the container
 *
 * Note: Instagram's API cannot accept file uploads directly — the video
 * must be reachable at a public URL. The dashboard serves rendered files
 * at /media/<file>; point IG_VIDEO_BASE_URL at the dashboard's public
 * address (e.g. https://media.yourdomain.com).
 * Instagram's/Meta's OWN limits apply — our software never meters anything.
 */
export async function uploadToInstagram(payload: PublishPayload): Promise<string> {
  const igUserId = env('INSTAGRAM_USER_ID');
  const token = env('INSTAGRAM_ACCESS_TOKEN');
  const base = env('IG_VIDEO_BASE_URL');

  if (!igUserId || !token) {
    throw new Error('Instagram not configured (INSTAGRAM_USER_ID + INSTAGRAM_ACCESS_TOKEN)');
  }
  if (!base) {
    throw new Error('Instagram needs a public video URL — set IG_VIDEO_BASE_URL (e.g. the dashboard /media endpoint, publicly reachable)');
  }

  const videoUrl = `${base.replace(/\/+$/, '')}/media/${encodeURIComponent(basename(payload.filePath))}`;
  const caption = `${payload.title}\n\n${payload.description}`.slice(0, 2200);

  // 1. Create container
  const create = await fetch(`https://graph.facebook.com/${API}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      access_token: token,
    }),
  });
  if (!create.ok) throw new Error(`Instagram container failed: HTTP ${create.status} ${await create.text()}`);
  const { id: creationId } = (await create.json()) as { id: string };

  // 2. Poll until FINISHED (Reels processing takes time — up to 5 min)
  let status = '';
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await fetch(
      `https://graph.facebook.com/${API}/${creationId}?fields=status_code&access_token=${token}`
    );
    if (!st.ok) continue;
    const data = (await st.json()) as { status_code?: string };
    status = data.status_code ?? '';
    if (status === 'FINISHED') break;
    if (status === 'ERROR') throw new Error('Instagram container processing errored');
  }
  if (status !== 'FINISHED') throw new Error('Instagram container did not finish in time');

  // 3. Publish
  const pub = await fetch(`https://graph.facebook.com/${API}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: creationId, access_token: token }),
  });
  if (!pub.ok) throw new Error(`Instagram publish failed: HTTP ${pub.status} ${await pub.text()}`);
  const { id } = (await pub.json()) as { id: string };
  return `https://instagram.com/reel/${id}`;
}
