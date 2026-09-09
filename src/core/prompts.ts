/**
 * Expert prompt templates + platform presets.
 * Output quality starts here: a vague one-line prompt gives vague media;
 * a structured expert prompt with explicit rules gives the best possible
 * output from any model in the chain — local or external.
 */

export type Platform = 'youtube' | 'instagram' | 'facebook';

export interface PlatformPreset {
  label: string;
  targetSeconds: number;
  aspect: string;
  aspectRatio: number; // width / height
  toneGuide: string;
  cta: string;
  maxWords: number;
}

export const PLATFORM_PRESETS: Record<Platform, PlatformPreset> = {
  youtube: {
    label: 'YouTube',
    targetSeconds: 75,
    aspect: '16:9 landscape',
    aspectRatio: 16 / 9,
    toneGuide: 'clear, confident, helpful — a smart friend explaining, never salesy',
    cta: 'end with a one-line ask to subscribe for more videos like this',
    maxWords: 170,
  },
  instagram: {
    label: 'Instagram Reels',
    targetSeconds: 35,
    aspect: '9:16 vertical',
    aspectRatio: 9 / 16,
    toneGuide: 'punchy, energetic, conversational — fast hook, zero fluff',
    cta: 'end with a quick prompt to follow for more',
    maxWords: 85,
  },
  facebook: {
    label: 'Facebook',
    targetSeconds: 55,
    aspect: '16:9 landscape',
    aspectRatio: 16 / 9,
    toneGuide: 'warm, community-minded, story-driven',
    cta: 'end with a friendly invitation to comment or share',
    maxWords: 130,
  },
};

export function platformPreset(platform: Platform | string | undefined): PlatformPreset {
  return PLATFORM_PRESETS[(platform as Platform) ?? 'youtube'] ?? PLATFORM_PRESETS.youtube;
}

/** Structured script prompt — hook, beats, word budget, CTA, strict output rules. */
export function scriptPrompt(topic: string, platform: Platform | string): string {
  const p = platformPreset(platform);
  return [
    `You are a senior short-form video scriptwriter. Write the spoken script for a ${p.targetSeconds}-second ${p.label} video about: "${topic}".`,
    ``,
    `Rules:`,
    `- First line is a HOOK: max 8 words, must create curiosity in 3 seconds.`,
    `- Then ${p.targetSeconds <= 40 ? '2-3' : '3-5'} tight beats delivering real value about the topic. One idea per sentence.`,
    `- Tone: ${p.toneGuide}.`,
    `- Spoken-word only: plain sentences a narrator reads aloud. No scene directions, no headings, no stage notes, no emoji.`,
    `- Word budget: ${Math.round(p.maxWords * 0.7)}-${p.maxWords} words total.`,
    `- Last line: ${p.cta}.`,
    ``,
    `Output ONLY the script text. No title, no formatting, no commentary.`,
  ].join('\n');
}

/** Storyboard prompt with the exact parseable format the renderer expects. */
export function storyboardPrompt(script: string, platform: Platform | string): string {
  const p = platformPreset(platform);
  return [
    `You are a storyboard director. Break the script below into a shot-by-shot storyboard for a ${p.label} video (${p.aspect}).`,
    ``,
    `Format — one line per shot, EXACTLY:`,
    `Shot N: [visual description] on-screen: [short text cue]`,
    ``,
    `Rules:`,
    `- 6-10 shots. Each visual description must be concrete and filmable (subject, framing, motion).`,
    `- Vary framing across shots (wide, close-up, over-shoulder, detail) — no repeated shots.`,
    `- The on-screen cue is max 6 words of overlay text for that moment.`,
    `- No text rendered inside the visual itself; no camera gear jargon in descriptions.`,
    ``,
    `Script:`,
    `${script}`,
    ``,
    `Output ONLY the shot lines.`,
  ].join('\n');
}

/** Critique prompt — strict editor scoring on a rubric; JSON-only reply. */
export function critiquePrompt(
  kind: 'script' | 'storyboard',
  content: string,
  platform: Platform | string
): string {
  const p = platformPreset(platform);
  const noun = kind === 'script' ? 'video script' : 'shot-by-shot storyboard';
  return [
    `You are a strict, experienced ${p.label} editor. Critique this ${noun}:`,
    ``,
    `${content}`,
    ``,
    `Score 1-10 on: hook strength, clarity, flow/structure, ${p.label} fit, and (for scripts) the closing CTA.`,
    `Reply ONLY with JSON, no markdown, no extra text:`,
    `{"score": <number 1-10>, "issues": ["<specific, fixable issue>", ...]}`,
  ].join('\n');
}

/** Refine prompt — rewrite fixing the listed issues, keeping what works. */
export function refinePrompt(
  kind: 'script' | 'storyboard',
  previous: string,
  feedback: string[]
): string {
  const noun = kind === 'script' ? 'script' : 'storyboard';
  return [
    `You are a senior short-form media writer. Rewrite the ${noun} below, fixing these issues:`,
    ...(feedback.length ? feedback.slice(0, 6).map((f) => `- ${f}`) : ['- improve overall quality and impact']),
    ``,
    `Keep everything that already works. Same format rules as before (spoken-word only / exact shot lines).`,
    ``,
    `Previous ${noun}:`,
    `${previous}`,
    ``,
    `Output ONLY the rewritten ${noun}.`,
  ].join('\n');
}
