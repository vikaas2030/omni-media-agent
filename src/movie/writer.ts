/**
 * Movie auto-writer — the FREE local LLM (Ollama) writes a complete
 * screenplay in our exact format, then we VALIDATE it with the real parser
 * and rewrite-with-feedback until it parses cleanly. No paid API involved.
 */

import { generate } from '../core/router.js';
import type { Registry } from '../core/registry.js';
import { parseScreenplay } from './screenplay.js';

export interface WriterOptions {
  minutes?: number;      // target film length
  language?: string;     // dialogue language, default Hindi
  characters?: string[]; // optional cast hints
}

export function writerPrompt(topic: string, opts: WriterOptions = {}): string {
  const minutes = opts.minutes ?? 2;
  const lang = opts.language ?? 'Hindi';
  const castHint = opts.characters?.length
    ? `\n# CAST hints (use these names/descriptions): ${opts.characters.join(', ')}`
    : '';
  return `You are a professional screenwriter for short animated films. Write a ${lang} screenplay about: ${topic}

Use this EXACT format, nothing else:

# MOVIE: <title>
# CAST: NAME1 (<short visual description>), NAME2 (<short visual description>)${castHint}

## SCENE 1: <TITLE IN ENGLISH CAPS>
SETTING: <one line, visual place + mood + light>
ACTION: <one line of physical movement>

NAME1 (<emotion words>): <dialogue line in ${lang}>
NARRATOR: <narration line in ${lang}>

Rules:
- ${Math.max(4, Math.min(15, Math.round(minutes * 3)))} scenes, each scene: SETTING + ACTION + 2-4 dialogue lines.
- Dialogue lines are SPOKEN by characters — emotional, punchy, dramatic. NARRATOR lines bind the story.
- The first scene must HOOK the viewer in 3 seconds. The last scene must end with a question or challenge.
- NAME must be UPPERCASE and must exactly match a CAST name (or NARRATOR).
- Output ONLY the screenplay text. No markdown fences, no commentary.`;
}

export interface ScreenplayValidation {
  ok: boolean;
  issues: string[];
}

export function validateScreenplayText(text: string): ScreenplayValidation {
  const issues: string[] = [];
  const trimmed = text.replace(/^```[a-z]*\n?|```$/g, '').trim();
  try {
    const sp = parseScreenplay(trimmed);
    if (sp.scenes.length === 0) issues.push('no scenes found — check "## SCENE n:" headers');
    if (sp.cast.length === 0) issues.push('no cast found — check "# CAST:" line');
    for (const scene of sp.scenes) {
      if (!scene.setting) issues.push(`scene ${scene.index}: missing SETTING`);
      if (scene.lines.length === 0) issues.push(`scene ${scene.index}: no dialogue/narration lines`);
    }
  } catch (err) {
    issues.push(`parse error: ${(err as Error).message}`);
  }
  return { ok: issues.length === 0, issues };
}

export async function writeScreenplay(
  topic: string,
  registry: Registry,
  opts: WriterOptions = {}
): Promise<{ screenplay: string; attempts: number }> {
  let prompt = writerPrompt(topic, opts);
  const maxAttempts = Number(process.env.WRITER_MAX_ATTEMPTS ?? 3);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await generate(
      { modality: 'llm', input: prompt, allowExternal: false }, // local LLM only
      registry
    );
    const text = (res.text ?? '').trim();
    const v = validateScreenplayText(text);
    if (v.ok) return { screenplay: text, attempts: attempt };
    if (attempt < maxAttempts) {
      prompt = `${writerPrompt(topic, opts)}\n\nYour previous attempt had these problems — FIX THEM:\n${v.issues.join('\n')}\n\nPrevious attempt (do not repeat verbatim):\n${text.slice(0, 2000)}`;
    } else {
      throw new Error(`screenplay writer failed after ${maxAttempts} attempts: ${v.issues.join('; ')}`);
    }
  }
  throw new Error('unreachable');
}
