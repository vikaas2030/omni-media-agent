import { Registry } from '../core/registry.js';
import { generate } from '../core/router.js';

export interface SeoMetadata {
  title: string;        // ≤ 60 chars, click-worthy but honest
  description: string;  // ≤ 200 chars, hook + CTA
  tags: string[];        // search tags for YouTube/Facebook
  hashtags: string[];    // Instagram style
}

/**
 * SEO metadata generator — local LLM, zero external dependency.
 * Output is strict JSON with a defensive parse-and-rebuild fallback.
 */
export async function generateSeoMetadata(
  topic: string,
  script: string,
  registry: Registry
): Promise<SeoMetadata> {
  const res = await generate(
    {
      modality: 'llm',
      input:
        `You are an SEO expert. For this video, return ONLY valid JSON (no markdown) ` +
        `with keys: title (max 60 chars, no clickbait lies), description (max 200 chars, ` +
        `hook + call to action), tags (8 search tags, array of strings), hashtags (6 hashtags, ` +
        `array of strings, each starting with #).\n\nTopic: ${topic}\n\nScript:\n${script.slice(0, 3000)}`,
    },
    registry
  );
  return parseSeo(res.text ?? '', topic);
}

export function parseSeo(raw: string, topic: string): SeoMetadata {
  const fallback: SeoMetadata = {
    title: topic.slice(0, 60),
    description: `${topic} — watch till the end!`.slice(0, 200),
    tags: topic.toLowerCase().split(/\s+/).slice(0, 8),
    hashtags: topic
      .toLowerCase()
      .split(/\s+/)
      .slice(0, 6)
      .map((w) => `#${w.replace(/[^a-z0-9]/g, '')}`),
  };
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd <= jsonStart) return fallback;
  try {
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as Partial<SeoMetadata>;
    return {
      title: (parsed.title ?? fallback.title).slice(0, 60),
      description: (parsed.description ?? fallback.description).slice(0, 200),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 12).map(String) : fallback.tags,
      hashtags: Array.isArray(parsed.hashtags)
        ? parsed.hashtags.slice(0, 8).map(String)
        : fallback.hashtags,
    };
  } catch {
    return fallback;
  }
}
