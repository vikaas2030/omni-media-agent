# Architecture

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

## Core rules

1. **The Router owns all generation.** No pipeline step talks to a model directly — it declares a *modality* (`llm`, `image`, `voice`, `video`, `audio`, `avatar`) and the router resolves a provider chain from `config/models.json`.
2. **Fallback is mandatory.** The chain is tried in order. Unhealthy or unconfigured providers are skipped; external providers are skipped entirely if the request doesn't allow external use or has no API key. A full chain failure is the only hard error.
3. **Every result is labelled.** Each generation result carries `providerType: 'local' | 'external'`, the fallback chain used, and a `limitsNote` for external providers. The dashboard surfaces exactly:
   - `LOCAL — Unlimited by our software`
   - `EXTERNAL — Provider's own limits apply`
4. **No internal metering.** The software itself never counts, throttles, or charges credits. Cost tracking is *observability only* (for your own external-API spend), never enforcement.
5. **Rights & policy gate before publishing.** Rendered media passes a pre-check (music licensing, asset ownership, platform policy keywords) before any upload step.

## Pipeline

```
script (llm) → storyboard (llm) → voiceover (voice) → images (image)
            → video (video) → FFmpeg render → rights/policy check → publish
```

Each step is a queued job; the worker runs 24×7. Steps are resumable — a failed step retries without redoing completed steps.

## Self-hosting

- `docker compose up` brings up Redis + Ollama + the worker.
- ComfyUI available as an optional compose profile (`--profile images`).
- Everything runs on your hardware; external connectors activate only when you add their API keys to `.env`.
