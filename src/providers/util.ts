import { writeFileSync } from 'fs';

export const env = (k: string, d = '') => (process.env[k] ?? d).trim();

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Download a remote video into /tmp and return the local path. */
export async function downloadVideo(url: string, keyQuery?: string): Promise<string> {
  const target = keyQuery && !url.includes('?') ? `${url}?key=${keyQuery}` : url;
  const res = await fetch(target);
  if (!res.ok) throw new Error(`video download failed: HTTP ${res.status} from ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const out = `/tmp/extvideo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.mp4`;
  writeFileSync(out, buf);
  return out;
}
