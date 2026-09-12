#!/bin/sh
set -eu

: "${PLUGGY_CLIENT_ID:?PLUGGY_CLIENT_ID is required}"
: "${PLUGGY_CLIENT_SECRET:?PLUGGY_CLIENT_SECRET is required}"
: "${CONTROL_PLANE_API_KEY:?CONTROL_PLANE_API_KEY is required}"
: "${OPENAI_TUNNEL_ID:?OPENAI_TUNNEL_ID is required}"

if [ -z "${PLUGGY_ITEM_IDS:-}" ] && [ -z "${PLUGGY_ITEM_ID:-}" ]; then
  echo "PLUGGY_ITEM_IDS or PLUGGY_ITEM_ID is required" >&2
  exit 1
fi

tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile pluggy-mcp \
  --tunnel-id "$OPENAI_TUNNEL_ID" \
  --mcp-command "node /app/dist/index.js"

exec tunnel-client run --profile pluggy-mcp
