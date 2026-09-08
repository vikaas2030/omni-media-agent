import { Queue, Worker } from 'bullmq';
import { Registry } from '../core/registry.js';
import { MediaJob, runPipeline } from '../pipeline/pipeline.js';
import { localProviders } from '../providers/local.js';
import { externalProviders } from '../providers/external.js';
import { startDashboard } from '../dashboard/server.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://redis:6379';
const [host, portPart] = REDIS_URL.replace('redis://', '').split(':');
const connection = { host, port: portPart ? Number(portPart) : 6379 };

const QUEUE_NAME = 'media-tasks';

const registry = new Registry();
[...localProviders, ...externalProviders].forEach((p) => registry.register(p));

/** 24×7 task queue. Jobs are durable in Redis; failures retry with backoff. */
export const mediaQueue = new Queue<MediaJob>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

const worker = new Worker<MediaJob>(
  QUEUE_NAME,
  async (job) => {
    console.log(`[worker] running job ${job.id}: ${job.data.topic}`);
    const result = await runPipeline(job.data, registry);
    console.log(`[worker] job ${job.id} done:`, result.log.join('\n'));
    return result;
  },
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2) }
);

worker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});

startDashboard(mediaQueue);

console.log(`[worker] omni-media-agent online — queue "${QUEUE_NAME}", 24×7.`);
