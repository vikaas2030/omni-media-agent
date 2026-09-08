import { Registry } from '../core/registry.js';
import { generate } from '../core/router.js';
import { rightsPolicyCheck, RightsCheckInput } from './rights-policy.js';
import { parseStoryboard, renderStoryboard } from './storyboard-render.js';
import { generateSeoMetadata, SeoMetadata } from './seo.js';
import { generateThumbnail } from './thumbnail.js';
import { Publisher, getPublisher } from '../publish/publishers.js';
import { createApproval } from '../approval/approvals.js';
import { concatWithIntro } from './concat.js';

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

  // 1. Script (local LLM — unlimited)
  const script = track(
    await generate({ modality: 'llm', input: scriptPrompt(job.topic) }, registry)
  );
  result.script = script.text;
  log.push(`script via ${script.providerId} (${script.providerType})`);

  // 2. Storyboard
  const storyboard = track(
    await generate({ modality: 'llm', input: storyboardPrompt(result.script!) }, registry)
  );
  result.storyboard = storyboard.text;
  log.push(`storyboard via ${storyboard.providerId} (${storyboard.providerType})`);

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

function scriptPrompt(topic: string): string {
  return `Write a short, engaging 60-second video script about: ${topic}. Hook in the first 3 seconds.`;
}

function storyboardPrompt(script: string): string {
  return `Break this script into a shot-by-shot storyboard. One line per shot, format: "Shot N: [visual description] on-screen: [short text cue]". Maximum 10 shots.\n\n${script}`;
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
