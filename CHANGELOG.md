# Changelog

## 0.1.0 — Open Source Edition (2026-09-08)

First public release. Core philosophy: **no artificial credits, local-first, external APIs optional**.

### Core
- Model Router with ordered fallback chains — an external API dying never stops the agent
- LOCAL / EXTERNAL labelling baked into every generation result (dashboard shows both honestly)
- Provider registry with health checks; local providers always rank before external
- 24×7 BullMQ task queue, durable jobs, retry with backoff

### Local models (unlimited by our software)
- Ollama LLM connector (working)
- whisper.cpp STT (binary + model path wiring)
- Piper TTS (text via stdin)
- ComfyUI image generation (workflow API: /prompt → /history → /view)
- FFmpeg storyboard renderer — per-shot segments (image + Ken-Burns or gradient), drawtext overlays, concat + audio mux. Smoke-tested: pure-local video renders work with zero external APIs.

### Pipeline
- script → storyboard → SEO → voiceover → per-shot images → video → FFmpeg render → thumbnail → rights/policy gate → publish
- SEO metadata generator (title ≤60 chars, description, tags, hashtags — local LLM with JSON fallback)
- Thumbnail generator (local LLM → local image model → ffmpeg text overlay)
- Rights & policy pre-check gate (music licensing, third-party footage, platform policy flags)

### Publishing (official platform APIs, bring your own tokens)
- YouTube Data API v3 resumable upload + custom thumbnail + refresh-token flow
- Instagram Reels via Graph API (container → poll → publish; needs a public IG_VIDEO_BASE_URL)
- Facebook Page video upload (multipart)
- Approval vs autonomous modes — approval records in Redis, dashboard Approve/Reject publishes directly

### Dashboard (dependency-free, native http)
- Queue stats, pending approvals, recent jobs with LOCAL/EXTERNAL badges
- /media file serving (public video URL source for Instagram)
- CLI to enqueue jobs

### Infra
- docker-compose: Redis + Ollama + worker (+ optional ComfyUI profile)
- One-command `install.sh`
- CI (typecheck + tests), MIT license
