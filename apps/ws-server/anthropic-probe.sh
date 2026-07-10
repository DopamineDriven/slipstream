#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -v '^$' | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

# Raw SSE probe against /v1/messages — mirrors createStreamWorkup in
# src/anthropic/vector-store.ts: adaptive thinking, xhigh effort via
# output_config, tool_choice auto, service_tier auto, metadata.user_id,
# max_tokens at the sonnet-5 output ceiling (128k), no system prompt.
# Betas match handleBetaHeaders("claude-sonnet-5", true) in src/anthropic/base.ts.
# Custom store tools (file_search, conversation_memory_*) are omitted — they
# need a tool_result round trip a one-shot curl can't provide. The three
# server-executed tools stay in so the request surface matches production.

MODEL="claude-sonnet-5"
OUT_DIR="src/test/__out__/anthropic"
OUT_FILE="$OUT_DIR/probe.sse"
HDR_FILE="$OUT_DIR/probe.headers.txt"
mkdir -p "$OUT_DIR"

BETAS="advanced-tool-use-2025-11-20,context-1m-2025-08-07,files-api-2025-04-14,extended-cache-ttl-2025-04-11,web-fetch-2025-09-10,code-execution-2025-08-25"

read -r -d '' PAYLOAD <<JSON || true
{
  "model": "$MODEL",
  "stream": true,
  "max_tokens": 120000,
  "thinking": { "type": "adaptive", "display": "summarized" },
  "output_config": { "effort": "xhigh" },
  "tool_choice": { "type": "auto" },
  "service_tier": "auto",
  "metadata": { "user_id": "nrr6h4r4480f6kviycyo1zhf" },
  "tools": [
    { "type": "web_search_20250305", "name": "web_search" },
    { "type": "web_fetch_20250910", "name": "web_fetch", "citations": { "enabled": true } },
    { "type": "code_execution_20250825", "name": "code_execution" }
  ],
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "please write me a poem about JSDoc bros hiding in comment blocks from the wave of bliss that was advanced typescript flooding inundating the industry circa 2020 while simultaneously infusing it with Catullan (Catullus, the ancient Roman poet) irreverence"
        }
      ]
    }
  ]
}
JSON

echo "Probing $MODEL → $OUT_FILE"

curl -sS --no-buffer -X POST "https://api.anthropic.com/v1/messages" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: $BETAS" \
  -H "content-type: application/json" \
  -D "$HDR_FILE" \
  -d "$PAYLOAD" | tee "$OUT_FILE"

echo ""
echo "Raw SSE written to $OUT_FILE (response headers in $HDR_FILE)"
