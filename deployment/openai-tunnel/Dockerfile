FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim

ARG TUNNEL_CLIENT_VERSION=0.0.14

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSLO "https://github.com/openai/tunnel-client/releases/download/v${TUNNEL_CLIENT_VERSION}/tunnel-client-v${TUNNEL_CLIENT_VERSION}-linux-amd64.zip" \
  && curl -fsSL "https://github.com/openai/tunnel-client/releases/download/v${TUNNEL_CLIENT_VERSION}/SHA256SUMS.txt" | grep "tunnel-client-v${TUNNEL_CLIENT_VERSION}-linux-amd64.zip" | sha256sum -c - \
  && unzip -q "tunnel-client-v${TUNNEL_CLIENT_VERSION}-linux-amd64.zip" -d /usr/local/bin \
  && rm "tunnel-client-v${TUNNEL_CLIENT_VERSION}-linux-amd64.zip"

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY deployment/openai-tunnel/start-tunnel.sh /usr/local/bin/start-tunnel
RUN chmod 0555 /usr/local/bin/start-tunnel

ENV NODE_ENV=production
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD curl -fsS http://127.0.0.1:8080/readyz || exit 1

ENTRYPOINT ["/usr/local/bin/start-tunnel"]
