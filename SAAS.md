# Commercial SaaS boundary (Phase 6, optional)

The core of Omni Media Agent is MIT-licensed and **stays free and unlimited forever**. This document draws the exact line between the open-source core and any future commercial SaaS wrapper, so the "no artificial credits" promise can never be eroded by accident.

## What a SaaS wrapper MAY charge for

- **Hosting & operations** — running the agent for customers on your servers (compute, storage, bandwidth are real costs).
- **Managed convenience** — one-click setup, auto-updates, backups, monitoring, support.
- **Resold external APIs** — passing through Veo/Seedance/LTX/avatar credits, clearly priced and clearly labelled `EXTERNAL — provider's own limits apply`.
- **Team features** — multi-tenant dashboards, roles, shared approval queues.

## What a SaaS wrapper may NEVER do

- **Meter the core.** No credit systems, throttles, or feature gates *inside this codebase* or in forks of it.
- **Remove local capability.** The local-first path (Ollama, whisper.cpp, Piper, ComfyUI, FFmpeg) must remain fully functional in the open-source edition.
- **Hide provider limits.** LOCAL vs EXTERNAL labelling is honest and stays.
- **Ransomware updates.** Security fixes land in the open core first, not behind the paid tier.

## Implementation rule

Any commercial logic lives in a **separate service** (billing, auth, tenancy) that talks to the agent via its queue/API — never inside this repo. If a PR adds metering/enforcement here, it will be rejected (see CONTRIBUTING.md).
