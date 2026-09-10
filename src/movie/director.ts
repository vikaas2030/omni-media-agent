/**
 * The Director — turns a screenplay into an ordered shot plan.
 * Every dialogue line becomes its own animated shot so the character can
 * SPEAK it (TTS + lip-sync); every scene gets an establishing shot and
 * action beat so the film feels cinematic, not documentary.
 */

import type { Screenplay } from './screenplay.js';

export interface MovieShot {
  id: number;
  sceneIndex: number;
  sceneTitle: string;
  kind: 'establishing' | 'action' | 'dialogue';
  imagePrompt: string;
  motionPrompt: string;
  character?: string;
  emotion?: string;
  line?: string;
  estSeconds: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function planShots(
  sp: Screenplay,
  style = 'epic Indian mythological cinematic, painterly matte style, dramatic light'
): MovieShot[] {
  const shots: MovieShot[] = [];
  let id = 0;

  for (const scene of sp.scenes) {
    const setting = scene.setting || 'ancient Indian royal setting, dramatic light';

    // 1. Establishing shot — sets the mood, slow cinematic push-in
    shots.push({
      id: ++id,
      sceneIndex: scene.index,
      sceneTitle: scene.title,
      kind: 'establishing',
      imagePrompt: `${style}. Establishing wide shot: ${setting}.`,
      motionPrompt:
        'slow cinematic camera push-in, subtle drift, dust particles moving in light, cloth and hair moving in wind',
      estSeconds: 4,
    });

    // 2. Action beat — real movement on screen
    if (scene.action) {
      shots.push({
        id: ++id,
        sceneIndex: scene.index,
        sceneTitle: scene.title,
        kind: 'action',
        imagePrompt: `${style}. ${setting}. ${scene.action}`,
        motionPrompt: `${scene.action}. Dynamic camera follows the action, natural physical movement, cinematic energy`,
        estSeconds: 5,
      });
    }

    // 3. One animated shot per spoken line — character speaks with lip-sync
    for (const d of scene.lines) {
      const cast = sp.cast.find((c) => c.name === d.character);
      const who = d.isNarration
        ? 'wide atmospheric view of the scene'
        : `${cast?.description ?? d.character} (${d.character})`;
      const expression = d.emotion ? `expression: ${d.emotion}` : 'expressive face';
      shots.push({
        id: ++id,
        sceneIndex: scene.index,
        sceneTitle: scene.title,
        kind: 'dialogue',
        imagePrompt: `${style}. ${setting}. Medium shot of ${who}, ${expression}.`,
        motionPrompt: d.isNarration
          ? 'slow pan across the scene, atmospheric haze moving, cinematic'
          : `the character speaks these words naturally: "${d.line.slice(0, 90)}". Lips articulate clearly, natural head and hand gestures, ${d.emotion || 'emotional'} energy, steady camera`,
        character: d.character,
        emotion: d.emotion,
        line: d.line,
        // speaking pace ~2.2 words/sec + a beat; lip-sync pads to the audio anyway
        estSeconds: clamp(Math.ceil(d.line.split(/\s+/).length / 2.2) + 1, 3, 20),
      });
    }
  }

  return shots;
}
