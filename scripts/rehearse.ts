/**
 * Movie Mode REHEARSAL — full end-to-end pipeline run on CPU, no GPU needed.
 * Mock providers render gradient stills, zoompan clips and tone voices, so
 * the ENTIRE orchestration is proven before real models are attached:
 * screenplay -> shots -> stills -> animation -> TTS -> lip-sync fallback ->
 * concat (+ silent-audio normalization) -> subtitles -> auto-shorts.
 *
 * Run: npm run rehearse
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { Registry } from '../src/core/registry.js';
import type { Provider, GenerationRequest, GenerationResult } from '../src/core/types.js';
import { runMovie } from '../src/movie/pipeline.js';
import { makeShorts } from '../src/movie/shorts.js';

const exec = promisify(execFile);
const ts = () => Date.now();

class MockImage implements Provider {
  id = 'mock:image';
  modality = 'image' as const;
  type = 'local' as const;
  health = async () => true;

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const label = String(req.input).replace(/[':\\]/g, '').slice(0, 48);
    const out = `/tmp/omni-r-img-${ts()}.png`;
    const hue = Math.floor(Math.random() * 360);
    await exec('ffmpeg', ['-y', '-v', 'error',
      '-f', 'lavfi', '-i', `gradients=s=1280x720:c0=0x${((hue % 360) * 1000 + 0x66666).toString(16).padStart(6, '0')}`.slice(0, 0) + `gradients=s=1280x720:nb_colors=2`,
      '-frames:v', '1', out,
      '-vf', `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${label}':fontsize=30:fontcolor=white:x=40:y=650:box=1:boxcolor=black@0.5`,
    ]);
    return { artifactPath: out, providerId: this.id, providerType: 'local', fallbackChainUsed: [this.id], warnings: ['REHEARSAL MOCK'], externalCostUsd: 0 };
  }
}

class MockVideo implements Provider {
  id = 'mock:i2v';
  modality = 'video' as const;
  type = 'local' as const;
  health = async () => true;

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const input = typeof req.input === 'string' ? JSON.parse(req.input) : req.input as { imagePath: string };
    const seconds = Math.min(3, Math.max(2, Number(req.options?.seconds as number) ?? 2)); // fast rehearsal
    const out = `/tmp/omni-r-vid-${ts()}.mp4`;
    const frames = seconds * 10;
    await exec('ffmpeg', ['-y', '-v', 'error', '-loop', '1', '-i', input.imagePath, '-t', String(seconds),
      '-vf', `zoompan=z='min(zoom+0.0012,1.12)':d=${frames}:s=1280x720:fps=10`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p', out]);
    return { artifactPath: out, providerId: this.id, providerType: 'local', fallbackChainUsed: [this.id], warnings: ['REHEARSAL MOCK'], externalCostUsd: 0 };
  }
}

class MockTts implements Provider {
  id = 'mock:tts';
  modality = 'tts' as const;
  type = 'local' as const;
  health = async () => true;

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const text = String(req.input);
    const dur = Math.min(6, Math.max(0.6, text.split(/\s+/).length * 0.3 + 0.4));
    const voice = String(req.options?.voice ?? 'narrator');
    const freq = 160 + (voice.charCodeAt(0) % 12) * 25;
    const out = `/tmp/omni-r-tts-${ts()}.wav`;
    await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${dur.toFixed(2)}`, out]);
    return { artifactPath: out, providerId: this.id, providerType: 'local', fallbackChainUsed: [this.id], warnings: ['REHEARSAL MOCK'], externalCostUsd: 0 };
  }
}

const SCREENPLAY = `# MOVIE: Rehearsal Run
# CAST: A (a mock hero in red), B (a mock chief in blue)

## SCENE 1: TEST
SETTING: gradient hills at sunset
ACTION: A raises his hand to the sky

A (fierce): मैं प्रतिज्ञा लेता हूँ!
NARRATOR: इतिहास बदल गया।

## SCENE 2: END
SETTING: dark red battlefield at dusk
ACTION: the hero stands firm against the wind

B (shout): क्या यह महानता थी?
NARRATOR: कमेंट में लिखो।
`;

async function main() {
  const registry = new Registry();
  registry.register(new MockImage());
  registry.register(new MockVideo());
  registry.register(new MockTts());

  process.env.MOVIE_POLISH = '0'; // no RIFE/ESRGAN in rehearsal
  process.env.LIPSYNC_ENGINE = 'off'; // exercises honest voice-over fallback
  process.env.MOVIE_MAKE_SHORTS = '0'; // we render shorts manually below

  const result = await runMovie({ screenplay: SCREENPLAY }, registry);
  for (const line of result.log) console.log('  |', line);

  const finalOk = result.finalPath && readFileSync(result.finalPath).length > 1000;
  const srtOk = result.srtPath && readFileSync(result.srtPath!, 'utf8').includes('मैं प्रतिज्ञा लेता हूँ!');
  const dur = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', result.finalPath!]);
  const audioOk = (await exec('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', result.finalPath!])).stdout.includes('audio');

  const shorts = await makeShorts(result.finalPath!, [
    { id: 1, kind: 'dialogue', character: 'A', emotion: 'fierce', line: 'मैं प्रतिज्ञा लेता हूँ!', start: 0.2, end: 3.5 },
    { id: 2, kind: 'dialogue', character: 'B', emotion: 'shout', line: 'क्या यह महानता थी?', start: 9.0, end: 12.5 },
  ], { minSeconds: 2, count: 2, maxSeconds: 5 });
  const shortOk = shorts.length === 2 && readFileSync(shorts[0]).length > 500;

  console.log('\n=== REHEARSAL RESULT ===');
  console.log('final movie:', finalOk ? 'OK' : 'FAIL', `(${parseFloat(dur.stdout).toFixed(1)}s, audio=${audioOk})`);
  console.log('subtitles .srt:', srtOk ? 'OK' : 'FAIL');
  console.log('vertical shorts:', shortOk ? 'OK' : 'FAIL', `(${shorts.length} rendered)`);
  console.log('spoken shots:', result.spokenShots, '/', result.totalShots);

  if (!finalOk || !srtOk || !audioOk || !shortOk) {
    console.error('REHEARSAL FAILED');
    process.exit(1);
  }
  console.log('REHEARSAL PASSED — pipeline orchestration proven on CPU. Attach real models (Colab) and the same code renders the film.');
}

main().catch((err) => { console.error(err); process.exit(1); });
