import { env, sleep, downloadVideo } from './util.js';

/**
 * Avatar / presenter videos via HeyGen-style vendor APIs.
 * The vendor's OWN quotas/fees apply — our software never meters anything.
 *
 * Required env: AVATAR_API_KEY, AVATAR_ID, AVATAR_VOICE_ID
 * Optional:     AVATAR_VENDOR (default: heygen — more vendors welcome via PR)
 */

export interface AvatarStatus {
  done: boolean;
  failed: boolean;
  url?: string;
}

/**
 * Vendor-agnostic status parser. Tolerates the HeyGen shape
 * ({ data: { status, video_url } }) and common flat shapes
 * ({ status, video_url | videoUrl | download_url | url }).
 * Pure function — unit-tested without any network.
 */
export function parseAvatarStatus(data: unknown): AvatarStatus {
  const raw = (data as Record<string, unknown>) ?? {};
  const nested = (raw.data as Record<string, unknown>) ?? {};
  const source = { ...raw, ...nested };
  const status = String(source.status ?? '').toLowerCase();
  const url =
    (source.video_url as string) ??
    (source.videoUrl as string) ??
    (source.download_url as string) ??
    (source.url as string);
  return {
    done: status === 'completed' || status === 'success' || status === 'done',
    failed: status === 'failed' || status === 'error',
    url,
  };
}

export async function generateAvatarVideo(script: string): Promise<string> {
  const vendor = env('AVATAR_VENDOR', 'heygen').toLowerCase();
  if (vendor !== 'heygen') {
    throw new Error(`avatar vendor "${vendor}" not implemented yet — current support: heygen`);
  }

  const key = env('AVATAR_API_KEY');
  const avatarId = env('AVATAR_ID');
  const voiceId = env('AVATAR_VOICE_ID');
  if (!key || !avatarId || !voiceId) {
    throw new Error('avatar not configured (need AVATAR_API_KEY + AVATAR_ID + AVATAR_VOICE_ID)');
  }

  const create = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_inputs: [
        {
          character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' },
          voice: { type: 'text', input_text: script, voice_id: voiceId },
        },
      ],
    }),
  });
  if (!create.ok) {
    throw new Error(`avatar task creation failed: HTTP ${create.status} ${await create.text()}`);
  }
  const created = (await create.json()) as { data?: { video_id?: string } };
  const videoId = created.data?.video_id;
  if (!videoId) throw new Error('avatar API returned no video_id');

  // Poll (avatar rendering takes a while — up to ~10 minutes)
  for (let i = 0; i < 60; i++) {
    await sleep(10_000);
    const poll = await fetch(
      `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
      { headers: { 'X-Api-Key': key } }
    );
    if (!poll.ok) continue;
    const st = parseAvatarStatus(await poll.json());
    if (st.failed) throw new Error('avatar rendering failed on the provider side');
    if (st.done && st.url) return downloadVideo(st.url);
  }
  throw new Error('avatar rendering timed out');
}
