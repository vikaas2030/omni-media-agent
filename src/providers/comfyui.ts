import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFileSync } from 'fs';
import { Provider, GenerationRequest, GenerationResult } from '../core/types.js';

const exec = promisify(execFile);
const env = (k: string, d: string) => process.env[k] ?? d;

const BASE = () => env('COMFYUI_URL', 'http://comfyui:8188');
const CHECKPOINT = () => env('COMFYUI_CHECKPOINT', 'sd_xl_base_1.0.safetensors');

/**
 * ComfyUI image generation — local, unlimited.
 * Queues a minimal text2img workflow via /prompt, polls /history,
 * then downloads the output image via /view.
 */
export class ComfyUiProvider implements Provider {
  id = 'local:comfyui';
  modality = 'image' as const;
  type = 'local' as const;

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE()}/system_stats`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const prompt = String(req.input);
    const width = Number((req.options?.width as number) ?? 1024);
    const height = Number((req.options?.height as number) ?? 1024);
    const steps = Number((req.options?.steps as number) ?? 25);
    const negative = String((req.options?.negative as string) ?? 'blurry, low quality, watermark');

    const workflow = buildText2ImgWorkflow(prompt, negative, width, height, steps);
    const clientId = `omni-${Date.now()}`;

    const queueRes = await fetch(`${BASE()}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });
    if (!queueRes.ok) throw new Error(`ComfyUI /prompt HTTP ${queueRes.status}`);
    const { prompt_id: promptId } = (await queueRes.json()) as { prompt_id: string };

    const filename = await this.pollForOutput(promptId);
    const imgRes = await fetch(
      `${BASE()}/view?filename=${encodeURIComponent(filename)}&type=output`
    );
    if (!imgRes.ok) throw new Error(`ComfyUI /view HTTP ${imgRes.status}`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const outPath = `/tmp/comfyui-${Date.now()}.png`;
    writeFileSync(outPath, buf);

    return {
      artifactPath: outPath,
      providerId: this.id,
      providerType: 'local',
      fallbackChainUsed: [],
      warnings: [],
    };
  }

  private async pollForOutput(promptId: string, timeoutMs = 300_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(`${BASE()}/history/${promptId}`);
      if (!res.ok) continue;
      const history = (await res.json()) as Record<
        string,
        { outputs: Record<string, { images: { filename: string; type: string }[] }> }
      >;
      const entry = history[promptId];
      if (!entry) continue;
      for (const node of Object.values(entry.outputs)) {
        for (const img of node.images ?? []) {
          if (img.type === 'output') return img.filename;
        }
      }
      throw new Error('ComfyUI prompt finished without output images (check workflow/models)');
    }
    throw new Error('ComfyUI generation timed out');
  }
}

interface WorkflowNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title: string };
}

function buildText2ImgWorkflow(
  prompt: string,
  negative: string,
  width: number,
  height: number,
  steps: number
): Record<string, WorkflowNode> {
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: CHECKPOINT() },
      _meta: { title: 'Load checkpoint' },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: prompt, clip: ['1', 1] },
      _meta: { title: 'Positive prompt' },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: negative, clip: ['1', 1] },
      _meta: { title: 'Negative prompt' },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width, height, batch_size: 1 },
      _meta: { title: 'Latent' },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: Math.floor(Math.random() * 1_000_000_000),
        steps,
        cfg: 7,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1.0,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
      _meta: { title: 'VAE decode' },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { images: ['6', 0], filename_prefix: 'omni' },
      _meta: { title: 'Save image' },
    },
  };
}

/** Utility used by the thumbnail pipeline — text overlay via ffmpeg drawtext. */
export async function overlayTextOnImage(
  imagePath: string,
  text: string,
  outPath: string
): Promise<void> {
  await exec(env('FFMPEG_PATH', 'ffmpeg'), [
    '-y',
    '-i', imagePath,
    '-vf', `drawtext=text='${text.replace(/[':\\]/g, '')}':` +
      `fontsize=90:fontcolor=white:borderw=6:bordercolor=black:` +
      `x=(w-text_w)/2:y=h*0.35:` +
      `font=${env('FFMPEG_FONT', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')}`,
    '-frames:v', '1',
    outPath,
  ]);
}
