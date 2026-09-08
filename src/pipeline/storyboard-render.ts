import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);
const env = (k: string, d: string) => process.env[k] ?? d;

export interface Shot {
  label: string;
  text: string;             // overlay text cue
  visualDescription?: string; // scene description — used as the image prompt
  durationSeconds: number;
  imagePath?: string;       // optional b-roll / generated still behind the text
}

/**
 * Parse an LLM-produced storyboard ("Shot 1: ... on-screen: ..." style text,
 * or plain numbered lines) into shots. Falls back to sentence splitting.
 */
export function parseStoryboard(storyboardText: string): Shot[] {
  const shots: Shot[] = [];
  const lines = storyboardText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const m = line.match(/^(?:shot\s*)?(\d+)[:.)-]?\s*(.*)$/i);
    let text = (m ? m[2] : line).trim();
    // "Shot 2: [visual description] on-screen: [text cue]"
    // -> overlay the cue, keep the description for the image prompt
    const parts = text.split(/\bon[- ]screen:\s*/i);
    const visual = parts[0].trim();
    const cue = parts.length > 1 ? parts[1].trim() : visual;
    if (!cue && !visual) continue;
    shots.push({
      label: `Shot ${shots.length + 1}`,
      text: cue || visual,
      visualDescription: visual,
      durationSeconds: 5,
    });
  }

  // A line that is really a whole paragraph → split it into sentence shots
  const expanded: Shot[] = [];
  for (const shot of shots) {
    const sentences = shot.text.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (shot.text.length > 200 && sentences.length > 1) {
      for (const s of sentences) {
        expanded.push({ ...shot, label: `Shot ${expanded.length + 1}`, text: s.trim() });
      }
    } else {
      expanded.push(shot);
    }
  }
  shots.length = 0;
  shots.push(...expanded);

  if (shots.length === 0) {
    // Fallback: one shot per sentence of the script
    for (const s of storyboardText.split(/(?<=[.!?])\s+/).filter(Boolean)) {
      shots.push({ label: `Shot ${shots.length + 1}`, text: s.trim(), durationSeconds: 5 });
    }
  }
  return shots.slice(0, 20); // hard cap: 20 shots × 5s = 100s max
}

/**
 * FFmpeg storyboard renderer — the unlimited local video path.
 * Each shot becomes a 1920×1080 segment (generated still + Ken-Burns zoom,
 * or a dark gradient if no image) with the shot text overlaid via drawtext.
 * Segments are concatenated and muxed with the voiceover.
 */
export async function renderStoryboard(
  shots: Shot[],
  audioPath?: string,
  outPath = `/tmp/storyboard-${Date.now()}.mp4`
): Promise<string> {
  if (shots.length === 0) throw new Error('renderStoryboard: no shots to render');
  const font = env('FFMPEG_FONT', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf');
  const segPaths: string[] = [];

  for (const [i, shot] of shots.entries()) {
    const seg = `/tmp/seg-${Date.now()}-${i}.mp4`;
    const drawtext =
      `drawtext=text='${shot.text.replace(/[':\\]/g, '').slice(0, 120)}':` +
      `fontsize=54:fontcolor=white:borderw=5:bordercolor=black:` +
      `x=(w-text_w)/2:y=(h-text_h)/2:font=${font}`;

    let args = ['-y'];
    if (shot.imagePath) {
      // Still image background with a slow Ken-Burns zoom
      args = args.concat(
        '-loop', '1', '-t', String(shot.durationSeconds),
        '-i', shot.imagePath,
        '-vf', `zoompan=z='min(zoom+0.002,1.4)':d=${Math.round(shot.durationSeconds * 25)}:s=1920x1080,${drawtext}`,
        '-t', String(shot.durationSeconds)
      );
    } else {
      // gradients is a SOURCE filter — it must be the lavfi input, not in -vf
      args = args.concat(
        '-f', 'lavfi',
        '-i', `gradients=s=1920x1080:r=25:d=${shot.durationSeconds}:c0=0x0f172a:c1=0x1e293b`,
        '-vf', drawtext,
        '-t', String(shot.durationSeconds)
      );
    }
    args.push('-r', '25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', seg);
    await exec(env('FFMPEG_PATH', 'ffmpeg'), args);
    segPaths.push(seg);
  }

  // Concat segments
  const concatList = `/tmp/concat-${Date.now()}.txt`;
  const { writeFileSync } = await import('fs');
  writeFileSync(concatList, segPaths.map((p) => `file '${p}'`).join('\n'));

  if (audioPath) {
    await exec(env('FFMPEG_PATH', 'ffmpeg'), [
      '-y',
      '-f', 'concat', '-safe', '0', '-i', concatList,
      '-i', audioPath,
      '-c:v', 'libx264', '-c:a', 'aac', '-shortest',
      outPath,
    ]);
  } else {
    await exec(env('FFMPEG_PATH', 'ffmpeg'), [
      '-y',
      '-f', 'concat', '-safe', '0', '-i', concatList,
      '-c', 'copy',
      outPath,
    ]);
  }
  return outPath;
}
