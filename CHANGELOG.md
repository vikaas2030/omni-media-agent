# Changelog

## 0.5.0 — Movie Mode: free cinematic pipeline (2026-09-10)

- **Movie Mode** (`src/movie/`): screenplay → real animated film, 100% free
  resources, `allowExternal:false` enforced — a paid API is never contacted.
- Screenplay parser: `# MOVIE / # CAST / ## SCENE / SETTING / ACTION /
  NAME (emotion): dialogue` format, narration support.
- Director: shot planner — establishing + action beats + one animated shot
  per spoken line with character/emotion-aware image + motion prompts.
- Local I2V animation: ComfyUI Wan 2.1/2.2 image-to-video provider
  (`local:comfy-i2v`) with editable workflow template ({{PROMPT}}/{{IMAGE}}/
  {{FRAMES}} placeholders, WAN_I2V_WORKFLOW override). Free video chain is
  now FIRST: local I2V → optional externals → ffmpeg floor.
- Emotional Hindi TTS: Coqui XTTS provider (`local:xtts`) with per-character
  reference voices (MOVIE_VOICE_<NAME>).
- Lip-sync: Wav2Lip / LatentSync runners (LIPSYNC_ENGINE), honest voice-over
  fallback with a warning — never fake lip movement silently.
- Colab notebook for $0 GPU compute; FREE-STACK.md documents the whole
  free stack and free-GPU options. 3 new tests (41 total).

## 0.4.0 — Quality & reliability pass (2026-09-09)

- Expert prompt templates + platform presets (YouTube / Reels / Facebook):
  hook rules, word budgets, tone guides, exact storyboard format.
- Quality gate (`src/core/quality.ts`): every script and storyboard is
  validated, critiqued 1-10 by a strict LLM editor pass, and rewritten with
  the feedback until it clears the bar. Best attempt always wins; a valid
  draft passes on its own merits if the critique pass is unavailable.
  Env: `QUALITY_MIN_SCORE` (default 7), `QUALITY_MAX_ATTEMPTS` (default 3).
- Render verification: ffprobe checks the finished file (video stream,
  duration, audio) before publishing — corrupt or empty renders now fail
  loudly instead of going public. ffprobe absent → warning, not a crash.
- Router: per-provider transient-failure retry (default 1) before falling
  down the chain, so a socket blip no longer degrades output quality.
- 11 new tests (prompts, validation, quality gate). Real repo URL everywhere.

## 0.3.0 — Presenter + spend observability (2026-09-08)

- Avatar presenter connector (HeyGen v2 API: submit → poll → download),
  vendor-gated via AVATAR_VENDOR, bring-your-own-key.
- `--presenter` pipeline step: intro clip normalized (1080p/25fps/stereo)
  and prepended locally via FFmpeg. If the avatar provider is unavailable,
  the video continues without it — the agent never goes down with an API.
- External spend observability: SPEND_ESTIMATE_* env estimates surface per
  job (`externalSpendUsd`) and as a dashboard tile. Observability ONLY —
  our software meters nothing, ever.
- SAAS.md: hard boundary between the MIT core and any future commercial
  wrapper (no metering in the core, local path never removed).


## 0.2.0 — Scheduled publishing (2026-09-08)

- `--publish-at` flag on the CLI — schedule a video for a future time.
  Uses BullMQ durable delayed jobs: survives restarts, no cron needed.
- Naive times (`2026-09-10 18:00`) interpreted in `PUBLISH_TZ` (default Asia/Kolkata);
  full ISO 8601 with zone also accepted.
- Dashboard now shows `delayed` jobs in the queue stats.
- Phase 4 real external video connectors (Veo / Seedance / LTX) and
  config-order routing: `video: Veo → Seedance → LTX → local FFmpeg floor`.


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
