#!/usr/bin/env node
/**
 * omni — CLI for the Omni Media Agent queue.
 *
 * Examples:
 *   npm run cli -- --topic "Why local-first AI wins" --platform youtube
 *   npm run cli -- --topic "Gym promo" --platform instagram --publish --autonomous
 *   npm run cli -- --topic "Demo" --no-thumbnail
 *   npm run cli -- --topic "Dussehra special" --publish-at "2026-10-20 18:00"
 */
import { Queue } from 'bullmq';
import { parsePublishAt } from './schedule.js';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
};
const has = (name: string): boolean => args.includes(`--${name}`);

const topic = flag('topic');
const platform = flag('platform') ?? 'youtube';
const validPlatforms = ['youtube', 'instagram', 'facebook'];

if (!topic) {
  console.error(
    'Usage: omni --topic "Your video topic" [--platform youtube|instagram|facebook] [--publish] [--autonomous] [--no-thumbnail]'
  );
  process.exit(1);
}
if (!validPlatforms.includes(platform)) {
  console.error(`Unknown platform "${platform}". Valid: ${validPlatforms.join(', ')}`);
  process.exit(1);
}

const REDIS_URL = process.env.REDIS_URL ?? 'redis://redis:6379';
const [host, portPart] = REDIS_URL.replace('redis://', '').split(':');
const port = portPart ? Number(portPart) : 6379;

const queue = new Queue('media-tasks', { connection: { host, port } });

const publishAt = flag('publish-at');
let jobOpts: { delay?: number } = {};
let scheduledNote = '';
if (publishAt) {
  const scheduled = parsePublishAt(publishAt);
  jobOpts = { delay: scheduled.delayMs };
  scheduledNote = `\n   fires at  : ${scheduled.utc.toISOString()}`;
}

const job = await queue.add(
  'media',
  {
    topic,
    platform,
    publish: has('publish'),
    autonomous: has('autonomous'),
    makeThumbnail: !has('no-thumbnail'),
    publishAt: publishAt,
  },
  jobOpts
);

console.log(`✅ Job queued: ${job.id}`);
console.log(`   topic     : ${topic}`);
console.log(`   platform  : ${platform}`);
console.log(
  `   mode      : ${
    has('publish') ? (has('autonomous') ? 'autonomous publish' : 'approval mode') : 'draft only'
  }`
);
console.log(scheduledNote);
console.log(`   dashboard : http://localhost:${process.env.DASHBOARD_PORT ?? 3000}`);

await queue.close();
process.exit(0);
