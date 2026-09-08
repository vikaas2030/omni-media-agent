FROM node:20-slim

# ffmpeg for local rendering; curl for container healthchecks
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
COPY config ./config
RUN npm run build

CMD ["node", "dist/queue/worker.js"]
