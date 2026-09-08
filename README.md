# VIKAAS OMNI MEDIA SUPER AGENT — Open Source Edition

[![CI](https://github.com/YOUR_GITHUB_USERNAME/omni-media-agent/actions/workflows/ci.yml/badge.svg)](../../actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-2ea44f.svg)](LICENSE)

An open-source, self-hostable media super agent:

**script → storyboard → SEO → voiceover → images → video → FFmpeg render → thumbnail → rights/policy check → publish**

No internal credit system. No artificial limits. Local-first.

## Philosophy

- **No artificial credits.** Our software never meters or limits your usage. There is no "100 credits/month" — there never will be.
- **Local-first.** LLM, speech, images, and rendering run on *your* hardware via open-source models (Ollama, whisper.cpp, Piper, ComfyUI, FFmpeg). Pure-local video works with zero external APIs.
- **External APIs are optional connectors.** Bring your own key for Veo/Flow, Seedance, LTX, or avatar APIs — *their* limits and fees apply, and the dashboard says so honestly:
  - `LOCAL — Unlimited by our software`
  - `EXTERNAL — Provider's own limits apply`
- **Graceful fallback.** If an external API dies or its quota runs out, the Model Router falls back down the chain. The agent never fully stops.

## Quick start

```bash
./install.sh
```

That's it — Redis + Ollama + worker + dashboard come up, the local LLM pulls, and you get a dashboard at `http://localhost:3000`.

Queue your first video (draft only, approval mode):

```bash
npm run cli -- --topic "Why local-first AI wins" --platform youtube
```

Schedule one for a future time (delayed job, survives restarts — naive times use `PUBLISH_TZ`, default Asia/Kolkata):

```bash
npm run cli -- --topic "Dussehra special" --platform youtube --publish-at "2026-10-20 18:00"
```

Then open the dashboard, review the draft + its LOCAL/EXTERNAL badges, and Approve → publish (once platform tokens are configured).

## Architecture

```
                 SUPER AGENT
                     │
              MODEL ROUTER
                     │
       ┌─────────────┴─────────────┐
       │                           │
 LOCAL / OPEN SOURCE          EXTERNAL MODELS
       │                           │
       ├─ LLM (Ollama)          ├─ Veo/Flow
       ├─ Image (ComfyUI)       ├─ Seedance
       ├─ Voice (Whisper/Piper) ├─ LTX
       ├─ Video (anim)          ├─ Avatar APIs
       └─ Audio (FFmpeg)        └─ Other APIs
       │                           │
       └─────────────┬─────────────┘
                     ↓
               MEDIA PIPELINE
                     ↓
               FFmpeg RENDER
                     ↓
             RIGHTS + POLICY
                     ↓
              PUBLISHING
```

Details in [ARCHITECTURE.md](ARCHITECTURE.md). Build phases in [ROADMAP.md](ROADMAP.md).

## What works today

| Capability | Status | Path |
|---|---|---|
| LLM (scripts, storyboards, SEO) | ✅ | Local (Ollama) |
| Speech-to-text | ✅ wired | Local (whisper.cpp) |
| Text-to-speech voiceover | ✅ wired | Local (Piper) |
| Image generation (per shot, thumbnails) | ✅ | Local (ComfyUI) |
| Video render | ✅ smoke-tested | Local (FFmpeg storyboard renderer) |
| SEO metadata (title/description/tags/hashtags) | ✅ | Local LLM |
| Thumbnail generator | ✅ | Local LLM + image + ffmpeg |
| Rights & policy pre-check | ✅ | Local gate |
| YouTube upload (resumable + thumbnail) | ✅ | Official API, your tokens |
| Instagram Reels / Facebook Page | ✅ | Official API, your tokens |
| Approval vs autonomous modes + dashboard | ✅ | Native http, LOCAL/EXTERNAL badges |
| External video connectors (Seedance/LTX/Veo) | 🔜 Phase 4 | Bring-your-own-key stubs |
| Scheduled publishing (`--publish-at`) | ✅ | BullMQ delayed jobs, TZ-aware |

## Configuration

Everything is optional — local-only works out of the box with zero keys. See [.env.example](.env.example) for the full list:

- **Local:** `OLLAMA_MODEL`, `WHISPER_MODEL`, `PIPER_VOICE`, `COMFYUI_CHECKPOINT`, …
- **External (optional):** `SEEDANCE_API_KEY`, `LTX_API_KEY`, `VEO_API_KEY`, `AVATAR_API_KEY` — a connector activates only when its key exists.
- **Publishing (your tokens):** YouTube (`YOUTUBE_REFRESH_TOKEN` flow supported), Instagram (`IG_VIDEO_BASE_URL` must be publicly reachable), Facebook Page.

## Self-hosting

- `docker compose up` — Redis + Ollama + worker + dashboard
- `docker compose --profile images up` — adds local ComfyUI image generation
- Everything runs on your hardware; you own every byte.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — the "no metering, local-first, graceful fallback" rules are non-negotiable for merge.

## Commercial use

[MIT](LICENSE) — free forever. A commercial SaaS wrapper is explicitly allowed, but only within the boundary rules in [SAAS.md](SAAS.md): the core stays open and unlimited, metering lives in a separate service, never here.
