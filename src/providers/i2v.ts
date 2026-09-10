/**
 * ComfyUI image-to-video (I2V) — FREE LOCAL ANIMATION.
 * Uses open-weight video models (Wan 2.1/2.2 I2V, LTX-Video) running in the
 * user's own ComfyUI (docker-compose service `comfyui`, or any URL).
 *
 * A static scene still becomes an animated clip with real character motion.
 * Workflow template: config/wan-i2v-workflow.json with {{PROMPT}}, {{IMAGE}},
 * {{FRAMES}} placeholders. ComfyUI node drift? Export your working workflow
 * as "Save (API Format)" JSON and point WAN_I2V_WORKFLOW at it — same
 * placeholders.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Provider, GenerationRequest, GenerationResult } from '../core/types.js';

const exec = promisify(execFile);
const env = (k: string, d: string) => process.env[k] ?? d;
const BASE = () => env('COMFYUI_URL', 'http://comfyui:8188');

function loadWorkflowTemplate(): string {
  const custom = env('WAN_I2V_WORKFLOW', '');
  const path = custom && existsSync(custom)
    ? custom
    : new URL('../../config/wan-i2v-workflow.json', import.meta.url).pathname;
  return readFileSync(path, 'utf-8');
}

interface I2vInput {
  imagePath: string;
  motionPrompt: string;
}

export class ComfyI2vProvider implements Provider {
  id = 'local:comfy-i2v';
  modality = 'video' as const;
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
    const input: I2vInput =
      typeof req.input === 'string' ? JSON.parse(req.input) : (req.input as I2vInput);
    if (!input?.imagePath || !input?.motionPrompt) {
      throw new Error('I2V input needs { imagePath, motionPrompt }');
    }
    const seconds = Math.max(2, Math.min(15, Number(req.options?.seconds as number) ?? 5));
    // Wan models run at 16fps and need frame counts like 33/49/65/81
    const frames = Math.max(33, Math.round((seconds * 16 + 1) / 16) * 16 + 1);

    // 1. Upload the still image
    const { basename } = await import('path');
    const form = new globalThis.FormData();
    form.append('image', new globalThis.Blob([readFileSync(input.imagePath)]), basename(input.imagePath));
    const upRes = await fetch(`${BASE()}/upload/image`, { method: 'POST', body: form });
    if (!upRes.ok) throw new Error(`ComfyUI /upload/image HTTP ${upRes.status}`);
    const { name: uploadedName } = (await upRes.json()) as { name: string };

    // 2. Build the workflow (template + placeholders)
    const workflow = loadWorkflowTemplate()
      .replaceAll('{{PROMPT}}', input.motionPrompt.replace(/"/g, '\\"'))
      .replaceAll('{{IMAGE}}', uploadedName)
      .replaceAll('{{FRAMES}}', String(frames));

    // 3. Queue and poll
    const clientId = `omni-i2v-${Date.now()}`;
    const qRes = await fetch(`${BASE()}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: JSON.parse(workflow), client_id: clientId }),
    });
    if (!qRes.ok) throw new Error(`ComfyUI /prompt HTTP ${qRes.status}`);
    const { prompt_id: promptId } = (await qRes.json()) as { prompt_id: string };

    const outName = await this.pollForOutput(promptId, 15 * 60 * 1000);
    // 4. Download
    const viewRes = await fetch(
      `${BASE()}/view?filename=${encodeURIComponent(outName.filename)}&subfolder=${encodeURIComponent(outName.subfolder ?? '')}&type=output`
    );
    if (!viewRes.ok) throw new Error(`ComfyUI /view HTTP ${viewRes.status}`);
    const buf = Buffer.from(await viewRes.arrayBuffer());

    let outPath = `/tmp/omni-i2v-${Date.now()}.mp4`;
    writeFileSync(outPath, buf);
    if (/\.webm$/i.test(outName.filename)) {
      const mp4 = outPath.replace(/\.mp4$/, '-c.mp4');
      await exec('ffmpeg', ['-y', '-v', 'error', '-i', outPath, '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-c:a', 'aac', mp4]);
      outPath = mp4;
    }
    return {
      artifactPath: outPath,
      providerId: this.id,
      providerType: 'local',
      fallbackChainUsed: [this.id],
      warnings: ['LOCAL — Unlimited by our software'],
      externalCostUsd: 0,
    };
  }

  private async pollForOutput(
    promptId: string,
    timeoutMs: number
  ): Promise<{ filename: string; subfolder?: string }> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`${BASE()}/history/${promptId}`);
      if (!res.ok) continue;
      const hist = (await res.json()) as Record<string, { outputs: Record<string, Record<string, Array<{ filename: string; subfolder?: string; type?: string }>>> } >;
      const entry = hist[promptId];
      if (!entry?.outputs) continue;
      for (const nodeOutputs of Object.values(entry.outputs)) {
        for (const key of ['videos', 'gifs', 'images']) {
          const arr = nodeOutputs[key];
          if (Array.isArray(arr) && arr.length > 0) {
            const f = arr.find((x) => /\.(mp4|webm)$/i.test(x.filename)) ?? arr[0];
            return { filename: f.filename, subfolder: f.subfolder };
          }
        }
      }
    }
    throw new Error('ComfyUI I2V timed out');
  }
}
