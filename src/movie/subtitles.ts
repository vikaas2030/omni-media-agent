/**
 * Subtitles — free SRT built from our own shot timings + dialogue lines.
 * No transcription service needed: we generated the lines, we know the times.
 */

export interface SrtEntry {
  start: number; // seconds
  end: number;
  character?: string;
  line: string;
}

export function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const mmm = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${mmm}`;
}

export function buildSrt(entries: SrtEntry[]): string {
  return entries
    .map((e, i) => {
      const who = e.character && e.character !== 'NARRATOR' ? `${e.character}: ` : '';
      return `${i + 1}\n${srtTime(e.start)} --> ${srtTime(e.end)}\n${who}${e.line}\n`;
    })
    .join('\n');
}
