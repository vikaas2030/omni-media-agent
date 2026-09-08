#!/usr/bin/env bash
# Omni Media Agent — one-command installer
set -euo pipefail

echo "🎬 Omni Media Agent — Open Source Edition installer"
echo ""

# 1. Docker + Compose v2 check
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker not found. Install it first: https://docs.docker.com/get-docker/"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "❌ Docker Compose v2 not found (needed for 'docker compose')."
  exit 1
fi
echo "✅ Docker + Compose found"

# 2. Environment file
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created .env from .env.example (all optional — local-only works out of the box)"
else
  echo "✅ Existing .env kept"
fi

# 3. Build & start Redis + Ollama + worker + dashboard
echo "⏳ Building and starting containers (first run takes a few minutes)…"
docker compose up -d --build

# 4. Pull the local LLM
MODEL="${OLLAMA_MODEL:-llama3.1}"
echo "⏳ Pulling local model: ${MODEL} (one-time download)…"
docker compose exec -T ollama ollama pull "${MODEL}"

PORT="${DASHBOARD_PORT:-3000}"
echo ""
echo "──────────────────────────────────────────────────"
echo "✅ Omni Media Agent is running"
echo ""
echo "   Dashboard : http://localhost:${PORT}"
echo "   Local LLM : ${MODEL} — unlimited by our software"
echo "   Queue     : 24×7 (approval mode by default)"
echo ""
echo "   External APIs (Veo/Seedance/LTX, publishing) activate"
echo "   ONLY if you add your own keys to .env — and their"
echo "   provider limits apply, shown honestly in the dashboard."
echo ""
echo "   Queue your first job:"
echo "   npm run cli -- --topic \"Why local-first AI is the future\" --platform youtube"
echo "──────────────────────────────────────────────────"
