import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

const ffprobe = () => process.env.FFPROBE_PATH ?? 'ffprobe';
const ffmpeg = () => process.env.FFMPEG_PATH ?? 'ffmpeg';

export async function hasAudioStream(file: string): Promise<boolean> {
  try {
    const { stdout } = await exec(ffprobe(), [
      '-v', 'error', '-select_streams', 'a',
      '-show_entries', 'stream=index', '-of', 'csv=p=0', file,
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function mediaDuration(file: string): Promise<string> {
  const { stdout } = await exec(ffprobe(), [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ]);
  const d = Number(stdout.trim());
  return Number.isFinite(d) ? d.toFixed(2) : '5';
}

/**
 * Prepend a presenter/avatar intro clip to the rendered video.
 * Both are normalized (1920×1080, 25fps, stereo 44.1kHz) so the concat
 * filter is always dealing with identical streams. Runs locally via FFmpeg.
 */
export async function concatWithIntro(introPath: string, mainPath: string): Promise<string> {
  if (!(await hasAudioStream(introPath))) {
    throw new Error('presenter intro clip has no audio track');
  }
  const mainHasAudio = await hasAudioStream(mainPath);
  const out = `/tmp/final-intro-${Date.now()}.mp4`;

  const args = ['-y', '-i', introPath, '-i', mainPath];
  let audioFilters: string;
  let concatInput = '[v0][a0][v1][a1]';

  if (!mainHasAudio) {
    const dur = await mediaDuration(mainPath);
    args.push('-f', 'lavfi', '-t', dur, '-i', 'anullsrc=r=44100:cl=stereo');
    audioFilters =
      '[0:a]aresample=44100,aformat=channel_layouts=stereo[a0];' +
      '[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a1]';
  } else {
    audioFilters =
      '[0:a]aresample=44100,aformat=channel_layouts=stereo[a0];' +
      '[1:a]aresample=44100,aformat=channel_layouts=stereo[a1]';
  }

  const videoFilters =
    '[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,' +
    'pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=25,setsar=1[v0];' +
    '[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,' +
    'pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=25,setsar=1[v1]';

  args.push(
    '-filter_complex',
    `${videoFilters};${audioFilters};${concatInput}concat=n=2:v=1:a=1[v][a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p',
    out
  );
  await exec(ffmpeg(), args);
  return out;
}
