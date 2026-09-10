# The FREE Stack — $0, no paid APIs, ever

Movie Mode runs entirely on open-source / open-weight software. Nothing in
the movie pipeline contacts a paid API (`allowExternal:false` is enforced in
`src/movie/pipeline.ts`).

| Stage | Free component | Notes |
|---|---|---|
| Script / screenplay help | Ollama (llama3.1 etc.) | local, unlimited |
| Scene stills | SDXL / FLUX via ComfyUI | local |
| **Character animation** | **Wan 2.1/2.2 I2V** (Apache-2.0 open weights) via ComfyUI | 480p fp8 runs on ~8-12GB VRAM; LTX-Video as a faster alternative |
| Dialogue voice (Hindi, expressive) | Coqui XTTS v2 | local server, per-character reference voices (`MOVIE_VOICE_<NAME>`) |
| Fast TTS fallback | Piper | local |
| **Lip-sync** | Wav2Lip (light) or LatentSync (better) | `LIPSYNC_ENGINE` env; falls back to voice-over with an honest warning |
| Editing / render | FFmpeg | local, unlimited |
| Background music | your own open-licensed tracks (`MOVIE_BG_MUSIC`) | we never fake rights |

## Free GPU compute (no GPU of your own?)

| Option | Free tier | Good for |
|---|---|---|
| Your own GPU | always free | everything |
| Google Colab (free) | T4 16GB, ~12h sessions | Wan 1.3B T2V / quantized I2V, Wav2Lip, XTTS |
| Kaggle | 30 GPU-hours/week (T4 x2) | longer batch runs |
| Lightning AI / Modal free credits | small monthly credits | burst runs |

`colab/MOVIE-STUDIO-FREE-GPU.ipynb` sets up the animation + lip-sync + TTS
stack on a free Colab T4 and hands files back via Google Drive.

## Run a movie

```
docker compose up -d --build --profile images   # + comfyui profile with video models
export LIPSYNC_ENGINE=wav2lip
# write screenplay.movie (format in src/movie/screenplay.ts), then:
node -e "import('./dist/movie/pipeline.js').then(m => m.runMovie({screenplay: require('fs').readFileSync('screenplay.movie','utf8')}))"
```

Every shot is logged with which FREE provider made it. If something is
missing, the run fails loudly — it never silently falls back to a paid API.
