FROM node:24-bookworm-slim
RUN npm install -g @openai/codex@0.162.1
WORKDIR /app
COPY codex.mjs server.mjs ./
RUN mkdir -p /data/codex /data/requests && chown -R node:node /data /app
ENV CODEX_HOME=/data/codex PORT=8080
USER node
VOLUME ["/data"]
EXPOSE 8080
CMD ["node","server.mjs"]
