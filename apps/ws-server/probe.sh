#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -v '^$' | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi


curl https://ai-gateway.vercel.sh/v1/responses \
  -H "Authorization: Bearer $AI_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  --no-buffer \
  -d '{
    "model": "moonshotai/kimi-k2.5",
    "stream": true,
    "input": [
        {
        "type": "message",
        "role": "user",
        "content": "hey kimi, please write me a poem about JSDoc bros hiding in comment blocks from the wave of bliss that was advanced typescript flooding mainstream development circa 2020 while simultaneously infusing it with Catullan (Catullus, the ancient Roman poet) irreverence"
      }
    ],
    "providerOptions": {
      "gateway": {
        "zeroDataRetention": true
      }
    }
  }' \
  > notes/sse-kimi-k2-5.txt
