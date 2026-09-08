import { readFile } from 'fs/promises';
import { PublishPayload } from './publishers.js';

const env = (k: string) => (process.env[k] ?? '').trim();

/**
 * YouTube token: direct access token, or refresh-token flow
 * (YOUTUBE_REFRESH_TOKEN + YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET).
 */
export async function getYouTubeToken(): Promise<string> {
  const direct = env('YOUTUBE_ACCESS_TOKEN');
  if (direct) return direct;

  const refresh = env('YOUTUBE_REFRESH_TOKEN');
  const clientId = env('YOUTUBE_CLIENT_ID');
  const clientSecret = env('YOUTUBE_CLIENT_SECRET');
  if (refresh && clientId && clientSecret) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refresh,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) throw new Error(`YouTube token refresh failed: HTTP ${res.status}`);
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }
  throw new Error('YouTube not configured (set YOUTUBE_ACCESS_TOKEN, or YOUTUBE_REFRESH_TOKEN + client id/secret)');
}

/**
 * YouTube Data API v3 resumable upload:
 * 1. open resumable session with metadata → Location URL
 * 2. PUT the video bytes to the session URL
 * 3. set custom thumbnail (non-fatal)
 * YouTube's OWN quotas/limits apply — our software never meters anything.
 */
export async function uploadToYouTube(payload: PublishPayload): Promise<string> {
  const token = await getYouTubeToken();

  // 1. Resumable session
  const start = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify({
        snippet: {
          title: payload.title,
          description: payload.description,
          tags: payload.tags,
          categoryId: env('YOUTUBE_CATEGORY_ID') || '22',
        },
        status: {
          privacyStatus: env('YOUTUBE_PRIVACY') || 'public',
          selfDeclaredMadeForKids: false,
        },
      }),
    }
  );
  if (!start.ok) {
    throw new Error(`YouTube resumable session failed: HTTP ${start.status} ${await start.text()}`);
  }
  const uploadUrl = start.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube did not return a resumable session URL');

  // 2. Upload bytes
  const bytes = await readFile(payload.filePath);
  const up = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length) },
    body: bytes,
  });
  if (!up.ok) {
    throw new Error(`YouTube upload failed: HTTP ${up.status} ${await up.text()}`);
  }
  const video = (await up.json()) as { id: string };

  // 3. Thumbnail (best effort)
  if (payload.thumbnailPath) {
    try {
      const thumb = await readFile(payload.thumbnailPath);
      await fetch(
        `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${video.id}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
          body: thumb,
        }
      );
    } catch {
      // thumbnail is optional — never fail the publish for it
    }
  }

  return `https://www.youtube.com/watch?v=${video.id}`;
}
