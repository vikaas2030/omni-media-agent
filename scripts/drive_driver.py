#!/usr/bin/env python3
"""
Drive bridge driver — the agent side of the free Colab GPU worker.

- upload : write per-shot job JSONs to Drive omni-movie/queue/
- wait   : poll omni-movie/processed/ for status files + omni-movie/results/
           for rendered clips; download clips locally
- uses only stdlib (urllib) + the Drive access token from env DRIVE_TOKEN

Usage:
  drive_driver.py upload /tmp/movie-jobs.json
  drive_driver.py wait /tmp/movie-clips <expected_count>
"""

import json, os, sys, time, urllib.request, urllib.parse

TOKEN = os.environ.get('DRIVE_TOKEN', '')
API = 'https://www.googleapis.com/drive/v3'
UP = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
ROOT_NAME = 'omni-movie'
SUBS = ['queue', 'processed', 'results']


def req(url, data=None, method='GET', ctype='application/json', raw=False):
    r = urllib.request.Request(url, method=method)
    r.add_header('Authorization', 'Bearer ' + TOKEN)
    if data is not None:
        r.add_header('Content-Type', ctype)
        body = json.dumps(data).encode() if not raw else data
    else:
        body = None
    resp = urllib.request.urlopen(r, body, timeout=60)
    return resp.read()


def list_folders(name):
    q = urllib.parse.quote(f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false")
    out = json.loads(req(f'{API}/files?q={q}&fields=files(id,name)'))
    return [f['id'] for f in out.get('files', [])]


def create_folder(name, parent=None):
    meta = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
    if parent:
        meta['parents'] = [parent]
    out = json.loads(req(f'{API}/files', meta, 'POST'))
    print('created folder:', name, out['id'])
    return out['id']


def folder_map():
    """returns {queue: id, processed: id, results: id} — creating if needed"""
    roots = list_folders(ROOT_NAME)
    root = roots[0] if roots else create_folder(ROOT_NAME)
    ids = {'root': root}
    for s in SUBS:
        found = None
        for fid in [root]:
            q = urllib.parse.quote(f"name='{s}' and mimeType='application/vnd.google-apps.folder' and trashed=false")
            out = json.loads(req(f"{API}/files?q={q}&fields=files(id,name,parents)"))
            for f in out.get('files', []):
                if root in (f.get('parents') or []):
                    found = f['id']
                    break
        ids[s] = found or create_folder(s, root)
    return ids


def multipart_upload(name, content, parent, mime='application/octet-stream'):
    boundary = 'omni' + str(int(time.time() * 1000))
    meta = json.dumps({'name': name, 'parents': [parent]})
    head = (
        f'--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n'
        f'--{boundary}\r\nContent-Type: {mime}\r\n\r\n'
    ).encode()
    body = head + (content if isinstance(content, bytes) else content.encode()) + f'\r\n--{boundary}--\r\n'.encode()
    r = urllib.request.Request(UP, method='POST')
    r.add_header('Authorization', 'Bearer ' + TOKEN)
    r.add_header('Content-Type', f'multipart/related; boundary={boundary}')
    out = json.loads(urllib.request.urlopen(r, body, timeout=120).read())
    return out['id']


def upload_jobs(jobs_path):
    jobs = json.load(open(jobs_path))
    ids = folder_map()
    have = {f['name'] for f in json.loads(req(
        f"{API}/files?q={urllib.parse.quote(chr(39) + ids['queue'] + chr(39) + ' in parents and trashed=false')}&fields=files(name)"
    )).get('files', [])}
    for j in jobs:
        fname = f"job-{j['id']}.json"
        if fname in have:
            print('skip (already queued):', fname)
            continue
        multipart_upload(fname, json.dumps(j), ids['queue'], 'application/json')
        print('queued:', fname)
    print(f"{len(jobs)} jobs in queue")


def ls_folder(folder_id):
    q = urllib.parse.quote(f"'{folder_id}' in parents and trashed=false")
    return json.loads(req(f'{API}/files?q={q}&fields=files(id,name)&pageSize=200')).get('files', [])


def download(fid, dest):
    data = req(f'{API}/files/{fid}?alt=media')
    open(dest, 'wb').write(data)


def wait(clips_dir, expected, timeout_s=60 * 60 * 4):
    os.makedirs(clips_dir, exist_ok=True)
    ids = folder_map()
    t0 = time.time()
    seen, failed = set(), []
    while time.time() - t0 < timeout_s:
        statuses = {f['name']: f['id'] for f in ls_folder(ids['processed'])}
        clips = {f['name']: f['id'] for f in ls_folder(ids['results']) if f['name'].endswith('.mp4')}
        for name, fid in statuses.items():
            if name.startswith('status-') and name not in seen:
                seen.add(name)
                st = json.loads(req(f"{API}/files/{fid}?alt=media"))
                print('[status]', json.dumps(st))
                if st.get('status') != 'ok':
                    failed.append(st)
        got = len([n for n in clips])
        print(f"[{int(time.time()-t0)}s] clips: {got}/{expected} | statuses: {len(seen)} | failed: {len(failed)}")
        if len(seen) >= expected:
            if failed:
                print('SOME SHOTS FAILED:', json.dumps(failed))
                return 2
            for name, fid in clips.items():
                dest = os.path.join(clips_dir, name)
                if not os.path.exists(dest):
                    download(fid, dest)
                    print('downloaded:', dest)
            print('ALL CLIPS DONE')
            return 0
        time.sleep(60)
    print('TIMEOUT waiting for clips')
    return 1


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'upload':
        upload_jobs(sys.argv[2])
    elif cmd == 'wait':
        sys.exit(wait(sys.argv[2], int(sys.argv[3])))
    else:
        print(__doc__)
