import { readFile } from 'fs/promises';
import { PublishPayload } from './publishers.js';

const env = (k: string) => (process.env[k] ?? '').trim();
const API = 'v21.0';

/**
 * Facebook Page video upload via the official Graph API (multipart).
 * Meta's OWN limits apply — our software never meters anything.
 */
export async function uploadToFacebook(payload: PublishPayload): Promise<string> {
  const pageId = env('FACEBOOK_PAGE_ID');
  const token = env('FACEBOOK_ACCESS_TOKEN');
  if (!pageId || !token) {
    throw new Error('Facebook not configured (FACEBOOK_PAGE_ID + FACEBOOK_ACCESS_TOKEN)');
  }

  const bytes = await readFile(payload.filePath);
  const form = new FormData();
  form.append(
    'source',
    new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }),
    'video.mp4'
  );
  form.append('description', `${payload.title}\n\n${payload.description}`);
  form.append('access_token', token);

  const res = await fetch(`https://graph.facebook.com/${API}/${pageId}/videos`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Facebook upload failed: HTTP ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return `https://facebook.com/${data.id}`;
}
