# Contributing to Omni Media Agent

Thanks for helping build the most honest media agent out there. 🎬

## Non-negotiables (read first)

1. **No artificial limits.** The software never meters, throttles, or charges credits. Cost data is observability only.
2. **Local-first.** Every capability must have a local/open-source path. External APIs are optional connectors, and their limits are *their* limits — always surfaced via `limitsNote`, never hidden.
3. **Graceful fallback.** Any provider can die; the router must fall back. A feature that hard-requires one external API will not be merged.
4. **No heavy dependencies.** Prefer Node's built-ins (native `http`, `fetch`, `FormData`, `node:test`). Any new dependency needs a strong justification in your PR.

## Dev setup

```bash
git clone <repo> && cd omni-media-agent
npm install
cp .env.example .env
npm run typecheck   # tsc --noEmit
npm test            # unit tests (node:test — no external runner)
```

Full local run (Redis + Ollama + worker + dashboard):

```bash
docker compose up -d --build
docker compose exec ollama ollama pull llama3.1
```

## Adding a provider

1. Implement the `Provider` interface in `src/core/types.ts`.
2. Local providers go in `src/providers/local.ts` (or `comfyui.ts`); external ones in `src/providers/external.ts` — **external providers must extend `ExternalProvider`** (key-gated + mandatory `limitsNote`).
3. Add it to `config/models.json` routing chain — local entries before external ones.
4. Add a unit test if your provider has parsing/config logic.

## Adding a publisher

Follow `src/publish/youtube.ts` as the pattern: official platform APIs only, tokens from env, clear `not configured` errors.

## PR checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] No new dependency without justification
- [ ] LOCAL/EXTERNAL labelling respected (external results carry `limitsNote`)
- [ ] No metering/enforcement logic anywhere
