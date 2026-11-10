FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/voice && /opt/voice/bin/pip install --no-cache-dir faster-whisper==1.2.1
RUN /opt/voice/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-base',local_dir='/opt/whisper-base')"
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY *.mjs transcribe.py ./
RUN mkdir -p /data/codex /data/requests && chown -R node:node /data /app
ENV CODEX_HOME=/data/codex PORT=8080 PATH=/app/node_modules/.bin:$PATH
USER node
EXPOSE 8080
CMD ["node","server.mjs"]
