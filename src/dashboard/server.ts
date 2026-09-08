import http from 'http';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { basename } from 'path';
import type { Queue } from 'bullmq';
import { listApprovals, decideApproval, markApprovalPublished } from '../approval/approvals.js';
import { getPublisher } from '../publish/publishers.js';

const MEDIA_DIR = process.env.MEDIA_DIR ?? '/tmp';
const PORT = Number(process.env.DASHBOARD_PORT ?? 3000);

type AnyQueue = Queue;

/**
 * Minimal dependency-free dashboard:
 * - queue stats + recent jobs with LOCAL/EXTERNAL provider badges
 * - pending approvals with Approve/Reject (approval vs autonomous modes)
 * - /media/<file> serves rendered artifacts (also used as Instagram video_url base)
 */
export function startDashboard(queue: AnyQueue): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    try {
      // ---- API ----
      if (url.pathname === '/api/queue') {
        const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
        return json(200, counts);
      }

      if (url.pathname === '/api/completed') {
        const jobs = await queue.getCompleted(0, 19);
        return json(200, jobs.map((j) => ({
          id: j.id,
          topic: (j.data as { topic?: string }).topic,
          finishedOn: j.finishedOn,
          result: j.returnvalue,
        })));
      }

      if (url.pathname === '/api/approvals' && req.method === 'GET') {
        return json(200, await listApprovals());
      }

      if (url.pathname.startsWith('/api/approvals/') && req.method === 'POST') {
        const id = basename(url.pathname.replace('/api/approvals/', ''));
        const body = await readBody(req);
        const decision = body.decision === 'rejected' ? 'rejected' : 'approved';
        const rec = await decideApproval(id, decision, body.reason);
        if (!rec) return json(404, { error: 'approval not found' });
        if (decision === 'rejected') return json(200, rec);

        // approved → publish now (same process, real publishers)
        try {
          const publisher = getPublisher(rec.platform);
          const url2 = await publisher.upload({
            filePath: rec.filePath,
            thumbnailPath: rec.thumbnailPath,
            title: rec.title,
            description: rec.description,
            tags: rec.tags,
          });
          await markApprovalPublished(id, url2);
          return json(200, { ...rec, status: 'published', publishedUrl: url2 });
        } catch (err) {
          return json(502, { error: `publish failed: ${(err as Error).message}`, approval: rec });
        }
      }

      // ---- media files (public video URL for Instagram, previews) ----
      if (url.pathname.startsWith('/media/')) {
        const safe = basename(decodeURIComponent(url.pathname.replace('/media/', '')));
        const full = `${MEDIA_DIR}/${safe}`;
        if (!existsSync(full)) return json(404, { error: 'not found' });
        const data = await readFile(full);
        res.writeHead(200, { 'Content-Type': safe.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream' });
        return res.end(data);
      }

      // ---- dashboard page ----
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(dashboardHtml());
    } catch (err) {
      return json(500, { error: (err as Error).message });
    }
  });

  server.listen(PORT, () =>
    console.log(`[dashboard] http://localhost:${PORT} — approvals + LOCAL/EXTERNAL badges`)
  );
  return server;
}

function readBody(req: http.IncomingMessage): Promise<{ decision?: string; reason?: string }> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Omni Media Agent — Dashboard</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: system-ui, sans-serif; background: #0b1020; color: #e2e8f0; margin: 0; padding: 24px; }
  h1 { font-size: 20px; } h2 { font-size: 15px; color: #94a3b8; margin-top: 28px; }
  .stats { display: flex; gap: 12px; flex-wrap: wrap; }
  .stat { background: #131a2e; border: 1px solid #24304f; border-radius: 10px; padding: 12px 18px; min-width: 110px; }
  .stat b { display: block; font-size: 22px; }
  .stat span { color: #8ea0bf; font-size: 12px; }
  .card { background: #131a2e; border: 1px solid #24304f; border-radius: 10px; padding: 14px; margin: 8px 0; }
  .badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; margin-left: 6px; }
  .local { background: #064e3b; color: #6ee7b7; }
  .external { background: #78350f; color: #fbbf24; }
  button { cursor: pointer; border: 0; border-radius: 8px; padding: 6px 14px; font-weight: 600; margin-right: 6px; }
  .approve { background: #059669; color: #fff; } .reject { background: #b91c1c; color: #fff; }
  .muted { color: #8ea0bf; font-size: 12px; }
  .log { font-family: ui-monospace, monospace; font-size: 11px; color: #8ea0bf; white-space: pre-wrap; }
  a { color: #7dd3fc; }
</style></head><body>
<h1>🎬 Omni Media Agent — Open Source Edition</h1>
<div class="stats" id="stats"></div>
<h2>Pending approvals</h2><div id="approvals"></div>
<h2>Recent jobs</h2><div id="jobs"></div>
<script>
const badge = (r) => {
  const w = (r?.result?.log || []).join(' ');
  const ext = (r?.result?.log || []).some(l => l.includes('EXTERNAL')) ;
  return ext ? '<span class="badge external">EXTERNAL — provider limits apply</span>'
             : '<span class="badge local">LOCAL — unlimited by our software</span>';
};
async function refresh() {
  try {
    const q = await (await fetch('/api/queue')).json();
    document.getElementById('stats').innerHTML =
      ['waiting','active','delayed','completed','failed'].map(k =>
        '<div class="stat"><b>' + (q[k] ?? 0) + '</b><span>' + k + '</span></div>').join('');
  } catch {}
  try {
    const a = await (await fetch('/api/approvals')).json();
    document.getElementById('approvals').innerHTML = a.length ? a.map(r =>
      r.status === 'pending'
        ? '<div class="card"><b>' + r.topic + '</b> → ' + r.platform +
          '<div class="muted">' + r.title + '</div>' +
          (r.rightsWarnings?.length ? '<div class="muted">⚠ ' + r.rightsWarnings.join(' | ') + '</div>' : '') +
          '<div style="margin-top:8px"><button class="approve" onclick="decide(\\'' + r.id + '\\',\\'approved\\')">Approve & publish</button>' +
          '<button class="reject" onclick="decide(\\'' + r.id + '\\',\\'rejected\\')">Reject</button></div></div>'
        : '<div class="card muted">' + r.topic + ' — ' + r.status +
          (r.publishedUrl ? ' → <a href="' + r.publishedUrl + '">' + r.publishedUrl + '</a>' : '') + '</div>'
    ).join('') : '<div class="muted">No pending approvals — system is idle or in autonomous mode.</div>';
  } catch {}
  try {
    const j = await (await fetch('/api/completed')).json();
    document.getElementById('jobs').innerHTML = j.length ? j.map(r =>
      '<div class="card"><b>' + (r.topic || r.id) + '</b>' + badge(r) +
      '<div class="log">' + (r.result?.log || []).join('\\n') + '</div></div>'
    ).join('') : '<div class="muted">No completed jobs yet.</div>';
  } catch {}
}
async function decide(id, decision) {
  await fetch('/api/approvals/' + id, { method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ decision }) });
  refresh();
}
refresh(); setInterval(refresh, 5000);
</script></body></html>`;
}
