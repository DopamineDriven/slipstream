#!/usr/bin/env bash
set -euo pipefail

# raw SSE dump of sakana's Responses stream — the fields the chat service
# sets itself (stream, store, reasoning) are set explicitly here so the
# dump mirrors a real turn's wire surface
if [ -z "${SAKANA_API_KEY:-}" ]; then
    if [ -f .env ]; then
        export $(grep -v '^#' .env | grep -v '^$' | xargs)
    else
        echo "Error: SAKANA_API_KEY unset and no .env file found"
        exit 1
    fi
fi

MODEL="${1:-fugu}"
EFFORT="${2:-high}"
OUT="src/tests/sakana/stream/sse-${MODEL}-include.txt"
mkdir -p src/tests/sakana/stream

curl "https://api.sakana.ai/v1/responses" \
  -H "Authorization: Bearer $SAKANA_API_KEY" \
  -H "Content-Type: application/json" \
  --no-buffer \
  -d '{
    "model": "'"$MODEL"'",
    "stream": true,
    "store": false,
    "reasoning": { "effort": "'"$EFFORT"'" },
    "include": ["reasoning.encrypted_content"],
    "input": "Write a one-sentence haiku about Tokyo rain."
  }' \
  > "$OUT"

echo "wrote $OUT"
