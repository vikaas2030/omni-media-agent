/**
 * Screenplay parser — the input format for Movie Mode.
 *
 * # MOVIE: भीष्म — The Terrible Vow
 * # CAST: DEVAVRATA (young warrior prince, golden armor), DASHARAJ (old fisherman chief)
 *
 * ## SCENE 1: THE VOW
 * SETTING: A fisherman's riverside hut at dusk, firelight, tense faces
 * ACTION: Devavrata raises his palm with sacred water, lightning splits the sky
 *
 * DEVAVRATA (fierce, resolute): मैं जन्म से मृत्यु तक ब्रह्मचारी रहूँगा!
 * NARRATOR: और इसी पल इतिहास बदल गया।
 */

export interface Character {
  name: string;
  description: string;
}

export interface Dialogue {
  character: string;      // 'NARRATOR' for narration
  emotion: string;        // '' if not specified
  line: string;
  isNarration: boolean;
}

export interface MovieScene {
  index: number;
  title: string;
  setting: string;
  action: string;
  lines: Dialogue[];
}

export interface Screenplay {
  title: string;
  cast: Character[];
  scenes: MovieScene[];
}

export function parseScreenplay(text: string): Screenplay {
  const title = text.match(/^#\s*MOVIE:\s*(.+)$/m)?.[1]?.trim() ?? 'Untitled Movie';
  const cast: Character[] = [];
  const castRaw = text.match(/^#\s*CAST:\s*(.+)$/m)?.[1] ?? '';
  for (const entry of castRaw.split(/[,;](?![^()]*\))/)) {
    const m = entry.trim().match(/^([A-Z][A-Z_0-9 ]*?)\s*(?:\((.+)\))?\s*$/);
    if (m && m[1]) cast.push({ name: m[1].trim(), description: (m[2] ?? '').trim() });
  }

  const scenes: MovieScene[] = [];
  const sceneSplit = text.split(/^##\s*SCENE\s*(\d+)?:?\s*(.*)$/m);
  // split gives [pre, num1, title1, body1, num2, title2, body2, ...]
  for (let i = 1; i < sceneSplit.length; i += 3) {
    const body = sceneSplit[i + 2] ?? '';
    const setting = body.match(/^SETTING:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const action = body.match(/^ACTION:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const lines: Dialogue[] = [];
    const lineRe = /^([A-Z][A-Z_0-9 ]*?)\s*(?:\(([^)]+)\))?:\s*(.+)$/gm;
    let lm: RegExpExecArray | null;
    while ((lm = lineRe.exec(body)) !== null) {
      const character = lm[1].trim();
      // avoid capturing SETTING:/ACTION: as dialogue
      if (character === 'SETTING' || character === 'ACTION') continue;
      const isNarration = character === 'NARRATOR';
      if (!isNarration && cast.length > 0 && !cast.some((c) => c.name === character)) continue;
      lines.push({
        character,
        emotion: (lm[2] ?? '').trim(),
        line: lm[3].trim(),
        isNarration,
      });
    }
    scenes.push({ index: scenes.length + 1, title: (sceneSplit[i + 1] ?? '').trim(), setting, action, lines });
  }

  return { title, cast, scenes };
}
