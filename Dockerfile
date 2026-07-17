FROM node:20-bookworm-slim

LABEL org.opencontainers.image.source="https://github.com/oldrepublicwizard/cloudflare-one-gui-linux"
LABEL org.opencontainers.image.description="Cloudflare One GUI API server (requires host warp-cli)"

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json server.js ./
COPY public ./public
COPY assets ./assets
COPY scripts ./scripts
COPY bin ./bin

ENV PORT=4173
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" | grep -q cloudflare-one-gui

USER node
CMD ["node", "server.js"]
