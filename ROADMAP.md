# Roadmap — Omni Media Super Agent (Open Source Edition)

## Phase 1 — Core (DONE in v0 scaffold)
- [x] Model Router with ordered fallback chains (local-first)
- [x] LOCAL/EXTERNAL labelling baked into every generation result
- [x] Provider registry + health checks
- [x] Ollama LLM connector (working)
- [x] Whisper / Piper / ComfyUI / FFmpeg provider skeletons
- [x] External connector base class (key-gated, limitsNote mandatory)
- [x] Pipeline: script → storyboard → voiceover → video → render → rights → publish
- [x] Rights/policy pre-check gate
- [x] BullMQ 24×7 worker + docker-compose (Redis + Ollama + worker)

## Phase 2 — Local media depth (code-complete, smoke-tested where possible)
- [x] Real whisper.cpp wiring (binary + WHISPER_MODEL, txt output parsing)
- [x] Real Piper wiring (text via stdin, voice model from env)
- [x] ComfyUI workflow API integration (queue /prompt, poll /history, download /view)
- [x] FFmpeg storyboard renderer — per-shot segments (image + Ken-Burns, or gradient),
      drawtext overlays, concat + audio mux. **Verified: 3 smoke renders pass**
- [x] Thumbnail generator (local LLM → local image model → ffmpeg text overlay)
- [x] SEO metadata generator (title/description/tags/hashtags — local LLM, JSON fallback)
- [x] Pipeline wired: script → storyboard → SEO → voiceover → per-shot images → video → render → thumbnail → rights → publish

## Phase 3 — Publishing (code-complete, dashboard smoke-tested)
- [x] YouTube Data API v3 resumable upload + custom thumbnail + refresh-token flow
- [x] Instagram Reels via Graph API (container → poll → publish; needs public IG_VIDEO_BASE_URL)
- [x] Facebook Page video upload via Graph API (multipart)
- [x] Approval vs autonomous mode — approval records in Redis, dashboard Approve/Reject publishes directly
- [x] Dependency-free dashboard (native http): queue stats, pending approvals, recent jobs with LOCAL/EXTERNAL badges, /media file serving. **Verified: boot + API + badges pass**
- [ ] Scheduled publishing (publish_at) — carried to Phase 5

## Phase 4 — External connectors
- [ ] Seedance, LTX, Veo/Flow video connectors
- [ ] Avatar API connector
- [ ] Per-connector external spend *observability* (never enforcement)

## Phase 5 — Hardening & open-sourcing (release-ready)
- [x] MIT license, CONTRIBUTING.md with non-negotiables (no metering, local-first, fallback)
- [x] install.sh — one-command install (Docker check → .env → compose up → model pull)
- [x] CLI (`npm run cli -- --topic "…" --platform youtube`) + `omni` bin
- [x] CI (GitHub Actions: typecheck + tests + build) + 13 unit tests (node:test, zero test deps)
  — tests caught a real ESM type-re-export crash bug in the router, fixed
- [x] README with capability table, .gitignore, CHANGELOG
- [ ] Push to public GitHub repo (needs your account): git init + commit done — add remote & push
- [ ] Scheduled publishing (publish_at)

## Phase 6 — Optional SaaS wrapper (later)
- [ ] Multi-tenant hosting, billing — the core stays open and unlimited
