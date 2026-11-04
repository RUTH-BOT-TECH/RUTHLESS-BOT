FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv python3-pip ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
ENV ONNXRUNTIME_NODE_INSTALL=skip
RUN npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node . .
RUN chown node:node /app
USER node
ENV PYTHON_BIN=/home/node/.venv/bin/python
RUN python3 -m venv /home/node/.venv && /home/node/.venv/bin/python -m pip install --no-cache-dir --upgrade 'yt-dlp[default]'
ENV NODE_ENV=production
CMD ["node", "index.js"]
