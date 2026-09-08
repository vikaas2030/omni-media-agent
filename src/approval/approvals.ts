import { Redis } from 'ioredis';

export interface ApprovalRecord {
  id: string;
  createdAt: string;
  platform: string;
  topic: string;
  filePath: string;
  thumbnailPath?: string;
  title: string;
  description: string;
  tags: string[];
  rightsWarnings: string[];
  providerLog: string[];
  status: 'pending' | 'approved' | 'rejected' | 'published';
  decidedAt?: string;
  reason?: string;
  publishedUrl?: string;
}

const KEY = 'omni:approvals';

// Lazy connection — dashboard routes degrade gracefully if Redis is down.
let redis: Redis | null = null;
function conn(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379', {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
  }
  return redis;
}

export async function createApproval(
  data: Omit<ApprovalRecord, 'id' | 'createdAt' | 'status'>
): Promise<string> {
  const id = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const rec: ApprovalRecord = {
    ...data,
    id,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  await conn().hset(KEY, id, JSON.stringify(rec));
  return id;
}

export async function listApprovals(): Promise<ApprovalRecord[]> {
  try {
    const all = await conn().hgetall(KEY);
    return Object.values(all)
      .map((s) => JSON.parse(s) as ApprovalRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function getApproval(id: string): Promise<ApprovalRecord | null> {
  const s = await conn().hget(KEY, id);
  return s ? (JSON.parse(s) as ApprovalRecord) : null;
}

export async function decideApproval(
  id: string,
  decision: 'approved' | 'rejected',
  reason?: string
): Promise<ApprovalRecord | null> {
  const rec = await getApproval(id);
  if (!rec || rec.status !== 'pending') return rec;
  rec.status = decision;
  rec.decidedAt = new Date().toISOString();
  rec.reason = reason;
  await conn().hset(KEY, id, JSON.stringify(rec));
  return rec;
}

export async function markApprovalPublished(id: string, url: string): Promise<void> {
  const rec = await getApproval(id);
  if (!rec) return;
  rec.status = 'published';
  rec.publishedUrl = url;
  await conn().hset(KEY, id, JSON.stringify(rec));
}
