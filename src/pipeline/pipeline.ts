import { Registry } from '../core/registry.js';
import { generate } from '../core/router.js';
import { rightsPolicyCheck, RightsCheckInput } from './rights-policy.js';
import { parseStoryboard, renderStoryboard } from './storyboard-render.js';
import { generateSeoMetadata, SeoMetadata } from './seo.js';
import { generateThumbnail } from './thumbnail.js';
import { Publisher, getPublisher } from '../publish/publishers.js';
import { createApproval } from '../approval/approvals.js';
import { concatWithIntro } from './concat.js';
import { scriptPrompt, storyboardPrompt, platformPreset } from '../core/prompts.js';
import { generateBest } from '../core/quality.js';
import { ffprobeVerify, RenderCheck, validateScript, validateStoryboard } from '../core/validate.js';

export interface MediaJob {
  topic: string;
  platform: RightsCheckInput['platform'];
  musicSource?: RightsCheckInput['musicSource'];
  usesThirdPartyFootage?: boolean;
  publish: boolean;          // false = draft/simulate only
  autonomous?: boolean;     // true = publish without human approval gate
  makeThumbnail?: boolean;   // default true
  publishAt?: string;       // scheduled fire time (delayed BullMQ job)
  presenter?: boolean;      // prepend an avatar presenter intro (external, your key)
}

export interface PipelineResult {
  script?: string;
  storyboard?: string;
  voiceoverPath?: string;
  renderedPath?: string;
  thumbnailPath?: string;
  seo?: SeoMetadata;
  rights: ReturnType<typeof rightsPolicyCheck>;
  published: boolean;
  approvalId?: string;
  externalSpendUsd?: number; // observability ONLY — our software meters nothing
  renderCheck?: RenderCheck;
  log: string[];
}

/**
 * script → storyboard → SEO → voiceover → images → video → FFmpeg render
 *   → thumbnail → rights/policy → publish
 */
export async function runPipeline(job: MediaJob, registry: Registry): Promise<PipelineResult> {
  const log: string[] = [];
  const spendings: number[] = [];
  const track = <T extends { externalCostUsd?: number }>(r: T): T => {
    if (r.externalCostUsd) spendings.push(r.externalCostUsd);
    return r;
  };
  const result: PipelineResult = {
    rights: { passed: false, issues: [], warnings: [] },
    published: false,
    log,
  };

  const preset = platformPreset(job.platform);

  // 1. Script — expert prompt + quality gate (validate → critique → refine)
  const scriptOut = await generateBest({
    kind: 'script',
    firstPrompt: scriptPrompt(job.topic, job.platform),
    platform: job.platform,
    validate: (t) => validateScript(t, job.platform),
    registry,
  });
  result.script = scriptOut.text;
  if (scriptOut.externalCostUsd) spendings.push(scriptOut.externalCostUsd);
  log.push(`script: ${scriptOut.attempts} attempt(s), critique ${scriptOut.score}/10`);
  log.push(...scriptOut.log);

  // 2. Storyboard — same gate
  const boardOut = await generateBest({
    kind: 'storyboard',
    firstPrompt: storyboardPrompt(result.script!, job.platform),
    platform: job.platform,
    validate: (t) => validateStoryboard(t, job.platform),
    registry,
  });
  result.storyboard = boardOut.text;
  if (boardOut.externalCostUsd) spendings.push(boardOut.externalCostUsd);
  log.push(`storyboard: ${boardOut.attempts} attempt(s), critique ${boardOut.score}/10`);
  log.push(...boardOut.log);

  // 3. SEO metadata (title / description / tags — local LLM)
  result.seo = await generateSeoMetadata(job.topic, result.script!, registry);
  log.push(`seo metadata: "${result.seo.title}"`);

  // 4. Voiceover (local TTS)
  const voice = track(
    await generate(
      { modality: 'tts', input: result.script, options: { voice: 'default' } },
      registry
    )
  );
  result.voiceoverPath = voice.artifactPath;
  log.push(`voiceover via ${voice.providerId} (${voice.providerType})`);

  // 5. Images per shot (local image model; router falls back if unavailable)
  const shots = parseStoryboard(result.storyboard!);
  for (const shot of shots) {
    try {
      const img = track(
        await generate(
          {
            modality: 'image',
            input: `Cinematic still for a video shot: "${shot.visualDescription ?? shot.text}". 16:9 composition, no text.`,
            options: { width: 1280, height: 720 },
          },
          registry
        )
      );
      shot.imagePath = img.artifactPath;
      log.push(`image for ${shot.label} via ${img.providerId} (${img.providerType})`);
    } catch {
      log.push(`image for ${shot.label} skipped — gradient background will be used`);
    }
  }

  // 6. Video generation (external first if configured; local floor otherwise)
  let videoPath: string | undefined;
  try {
    const video = track(
      await generate(
        { modality: 'video', input: result.storyboard, allowExternal: true },
        registry
      )
    );
    videoPath = video.artifactPath;
    log.push(`video via ${video.providerId} (${video.providerType})`);
  } catch {
    log.push('video provider unavailable — local storyboard render only');
  }

  // 7. FFmpeg render — ALWAYS local, ALWAYS unlimited
  if (videoPath) {
    result.renderedPath = await mux(videoPath, result.voiceoverPath);
  } else {
    result.renderedPath = await renderStoryboard(shots, result.voiceoverPath);
  }
  log.push('render via ffmpeg (local)');

  // 7⅓. Verify the render is actually publishable media
  result.renderCheck = await ffprobeVerify(result.renderedPath!, {
    minSeconds: preset.targetSeconds * 0.4,
    requireAudio: Boolean(result.voiceoverPath),
  });
  if (result.renderCheck.info) {
    const i = result.renderCheck.info;
    log.push(
      `render verified: ${i.width}x${i.height}, ${i.durationSeconds.toFixed(1)}s, audio=${i.hasAudio}`
    );
  }
  for (const w of result.renderCheck.warnings) log.push(`render warning: ${w}`);
  if (!result.renderCheck.ok) {
    throw new Error(`render verification failed: ${result.renderCheck.issues.join(' | ')}`);
  }

  // 7½. Optional presenter intro (external avatar API — your key, their limits).
  //      If the avatar provider is unavailable, we continue WITHOUT it:
  //      the agent never goes down with an external API.
  if (job.presenter) {
    try {
      const intro = track(
        await generate(
          {
            modality: 'avatar',
            input: `In one or two friendly sentences, introduce a video titled "${result.seo.title}". Be direct and warm.`,
            allowExternal: true,
          },
          registry
        )
      );
      result.renderedPath = await concatWithIntro(intro.artifactPath!, result.renderedPath!);
      log.push(`presenter intro via ${intro.providerId} (${intro.providerType} — provider limits apply)`);
    } catch (err) {
      log.push(`presenter intro unavailable — continuing without it (${(err as Error).message})`);
    }
  }

  // Spend summary — observability ONLY, never enforced
  result.externalSpendUsd = Math.round(spendings.reduce((s, x) => s + x, 0) * 100) / 100;
  if (result.externalSpendUsd > 0) {
    log.push(
      `external spend estimate: $${result.externalSpendUsd.toFixed(2)} (observability only — our software meters nothing)`
    );
  }

  // 8. Thumbnail (local LLM + local image + ffmpeg overlay)
  if (job.makeThumbnail !== false) {
    try {
      const thumb = await generateThumbnail(job.topic, registry);
      result.thumbnailPath = thumb.path;
      log.push(`thumbnail: "${thumb.overlayText}"`);
    } catch {
      log.push('thumbnail skipped — image provider unavailable');
    }
  }

  // 9. Rights + policy gate
  result.rights = rightsPolicyCheck({
    title: job.topic,
    script: result.script!,
    musicSource: job.musicSource ?? 'unknown',
    usesThirdPartyFootage: job.usesThirdPartyFootage ?? false,
    platform: job.platform,
  });
  if (!result.rights.passed) {
    log.push(`BLOCKED by rights check: ${result.rights.issues.join(' | ')}`);
    return result;
  }

  // 10. Publish (or stop at draft for the approval flow)
  if (!job.publish) {
    log.push('draft complete — not published (approval mode)');
    return result;
  }
  if (!job.autonomous) {
    // Approval mode: park the finished media in the approval queue.
    // The dashboard shows it with its LOCAL/EXTERNAL badges and rights
    // warnings; a human approves → it publishes immediately.
    const approvalId = await createApproval({
      platform: job.platform,
      topic: job.topic,
      filePath: result.renderedPath!,
      thumbnailPath: result.thumbnailPath,
      title: result.seo.title,
      description: `${result.seo.description}\n\n${result.script}`,
      tags: result.seo.tags,
      rightsWarnings: result.rights.warnings,
      providerLog: log,
    });
    result.approvalId = approvalId;
    log.push(`approval ${approvalId} created — awaiting human decision in the dashboard`);
    return result;
  }

  const publisher: Publisher = getPublisher(job.platform);
  await publisher.upload({
    filePath: result.renderedPath!,
    thumbnailPath: result.thumbnailPath,
    title: result.seo.title,
    description: `${result.seo.description}\n\n${result.script}`,
    tags: result.seo.tags,
  });
  result.published = true;
  log.push(`published to ${job.platform}`);
  return result;
}

async function mux(videoPath: string, audioPath?: string): Promise<string> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const exec = promisify(execFile);
  const out = `/tmp/final-${Date.now()}.mp4`;
  const args = ['-y', '-i', videoPath];
  if (audioPath) args.push('-i', audioPath);
  args.push('-c:v', 'libx264', '-c:a', 'aac', '-shortest', out);
  await exec(process.env.FFMPEG_PATH ?? 'ffmpeg', args);
  return out;
}
