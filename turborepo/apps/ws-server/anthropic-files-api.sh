#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -v '^$' | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

jq -r '.[]' src/test/chapters/paths.json | while read -r path; do
    filename=$(basename "$path")
    echo "Uploading: $filename"

    response=$(curl -s -X POST "https://api.anthropic.com/v1/files" \
      -H "x-api-key: $ANTHROPIC_API_KEY" \
      -H "anthropic-version: 2023-06-01" \
      -H "anthropic-beta: files-api-2025-04-14" \
      -F "file=@$path" \
      -F "purpose=user_upload")

    echo "$response" | jq '.'
    echo "---"
done

echo "Upload process completed!"
