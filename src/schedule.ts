/**
 * Scheduled publishing support.
 *
 * BullMQ supports durable delayed jobs, so "publish at a time" needs no
 * cron service: the job sits in Redis and the 24×7 worker picks it up the
 * moment it is due. Survives restarts, zero extra infra.
 *
 * Accepted --publish-at formats:
 *   - Full ISO 8601 with zone: "2026-09-10T18:00:00Z", "2026-09-10T18:00:00+05:30"
 *   - Naive wall-clock: "2026-09-10 18:00" or "2026-09-10 18:30:00"
 *     → interpreted in PUBLISH_TZ (default: Asia/Kolkata)
 */

export interface ParsedPublishAt {
  utc: Date;        // the exact instant the job should fire
  delayMs: number;  // BullMQ delay option
}

const DEFAULT_TZ = 'Asia/Kolkata';

/** Offset (ms) that a timezone's wall clock is AHEAD of UTC at a given instant. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t: string): number =>
    Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  );
  return asUTC - utcMs;
}

export function parsePublishAt(input: string, now = Date.now()): ParsedPublishAt {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('empty --publish-at value');

  // normalize "YYYY-MM-DD HH:mm[:ss]" to "YYYY-MM-DDTHH:mm[:ss]"
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);

  let utcMs: number;
  if (hasZone) {
    // explicit zone — Date.parse handles it directly
    utcMs = Date.parse(normalized);
    if (Number.isNaN(utcMs)) throw new Error(`invalid --publish-at date: "${input}"`);
  } else {
    // naive wall-clock in PUBLISH_TZ: interpret as UTC baseline, then correct
    const tz = process.env.PUBLISH_TZ || DEFAULT_TZ;
    const baseline = Date.parse(`${normalized}Z`);
    if (Number.isNaN(baseline)) throw new Error(`invalid --publish-at date: "${input}"`);
    utcMs = baseline - tzOffsetMs(baseline, tz);
  }

  const delayMs = utcMs - now;
  if (delayMs <= 0) {
    throw new Error(`--publish-at "${input}" is in the past`);
  }
  return { utc: new Date(utcMs), delayMs };
}
