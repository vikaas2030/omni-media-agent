import { Registry } from '../core/registry.js';
import { generate } from '../core/router.js';
import { overlayTextOnImage } from '../providers/comfyui.js';

/**
 * Thumbnail generator — 100% local path:
 * 1. Local LLM writes a punchy ≤4-word thumbnail text for the topic.
 * 2. Local image model (ComfyUI) generates a 1280×720 background.
 * 3. FFmpeg overlays bold text.
 * Falls back through the router at every step — no external API required.
 */
export async function generateThumbnail(
  topic: string,
  registry: Registry
): Promise<{ path: string; overlayText: string }> {
  const textRes = await generate(
    {
      modality: 'llm',
      input:
        `Write ONE punchy YouTube-thumbnail text for a video about "${topic}". ` +
        `Maximum 4 words, ALL-CAPS, no quotes, no explanation — just the text.`,
    },
    registry
  );
  const overlayText = (textRes.text ?? topic).trim().split('\n')[0].slice(0, 40);

  const bg = await generate(
    {
      modality: 'image',
      input:
        `Vibrant YouTube thumbnail background illustration for a video about "${topic}". ` +
        `High contrast, dramatic lighting, no text in image.`,
      options: { width: 1280, height: 720, steps: 25 },
    },
    registry
  );
  if (!bg.artifactPath) throw new Error('thumbnail: image provider returned no artifact');

  const out = `/tmp/thumbnail-${Date.now()}.png`;
  await overlayTextOnImage(bg.artifactPath, overlayText.toUpperCase(), out);
  return { path: out, overlayText };
}
