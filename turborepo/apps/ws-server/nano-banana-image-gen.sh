#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -v '^$' | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi


curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:streamGenerateContent?alt=sse" \
  -H "x-goog-api-key: $GOOGLE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "contents": [{
    "parts": [
      {
        "file_data": {
          "file_uri": "https://generativelanguage.googleapis.com/v1beta/files/1761893699762",
          "mime_type": "image/png"
        }
      },
      {
        "file_data": {
          "file_uri": "https://generativelanguage.googleapis.com/v1beta/files/n6weaz7-ceje-umpjpfm2ac",
          "mime_type": "image/png"
        }
      },
      {
        "text": "Using the provided first image of doge at the fountain wearing sunglasses that is 1536x1024 in size, please use the second spherical image of doge attached and make the spherical image of doge a recursive ball of sorts underneath doges paw or laying on the ground next to doge in the original first image."
      }
    ]
  }]
}' \
  --no-buffer \
  >src/test/google/img-gen-with-images.sse

echo "Img Gen With Images Complete"
