FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /app

# Install ffmpeg + python + yt-dlp runtime deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    ca-certificates \
  && pip3 install --break-system-packages --no-cache-dir --pre "yt-dlp[default]" \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

EXPOSE 8080
CMD ["node", "server.js"]
