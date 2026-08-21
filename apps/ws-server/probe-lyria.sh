#!/usr/bin/env bash
set -euo pipefail

# Probe whether Lyria 3 Pro accepts a PDF through Interactions' DocumentContent

if [ -z "${GOOGLE_API_KEY:-}" ]; then
    if [ -f .env ]; then
        export $(grep -v '^#' .env | grep -v '^$' | xargs)
    else
        echo "Error: GOOGLE_API_KEY unset and no .env file found"
        exit 1
    fi
fi

MODEL="${1:-lyria-3-pro-preview}"
FILE_URI="${2:-https://generativelanguage.googleapis.com/v1beta/files/lljo61nbn89qcel72bekv3ty}"

OUT_DIR="src/test/google/interactions/lyria"
RAW="$OUT_DIR/response-${MODEL}-pdf.json"
LYRICS="$OUT_DIR/lyrics-${MODEL}-pdf.txt"

mkdir -p "$OUT_DIR"

PAYLOAD="$(
  jq -n \
    --arg model "$MODEL" \
    --arg file_uri "$FILE_URI" \
    '{
      model: $model,
      store: false,
      input: [
        {
          type: "text",
          text: "Read the attached document as source material and compose a roughly 90-second theatrical dark electro-cabaret song inspired by it. Use distinct verses, a chorus, and a bridge. The lyrics should be unmistakably grounded in the source document: incorporate several concrete motifs and details drawn from different parts of the document rather than merely responding to its overall mood. Do not simply summarize the document."
        },
        {
          type: "document",
          uri: $file_uri,
          mime_type: "application/pdf"
        }
      ]
    }'
)"

HTTP_STATUS="$(
  curl -sS \
    'https://generativelanguage.googleapis.com/v1beta/interactions' \
    -H "x-goog-api-key: ${GOOGLE_API_KEY}" \
    -H 'Content-Type: application/json' \
    --data-binary "$PAYLOAD" \
    -o "$RAW" \
    -w '%{http_code}'
)"

echo "HTTP $HTTP_STATUS"
echo "wrote raw response: $RAW"

if [[ "$HTTP_STATUS" -lt 200 || "$HTTP_STATUS" -ge 300 ]]; then
    echo
    echo "Lyria request failed:"
    jq . "$RAW" 2>/dev/null || cat "$RAW"
    exit 1
fi


jq -r '
  [
    .steps[]?
    | select(.type == "model_output")
    | .content[]?
    | select(.type == "text")
    | .text
  ]
  | join("\n\n")
' "$RAW" > "$LYRICS"

echo "wrote text output: $LYRICS"


echo
echo "returned content blocks:"
jq '
  [
    .steps[]?
    | select(.type == "model_output")
    | .content[]?
    | {
        type,
        mime_type,
        has_data: (.data != null),
        text_chars: ((.text // "") | length)
      }
  ]
' "$RAW"

AUDIO_COUNT="$(
  jq '
    [
      .steps[]?
      | select(.type == "model_output")
      | .content[]?
      | select(.type == "audio" and .data != null)
    ]
    | length
  ' "$RAW"
)"

echo
echo "audio blocks: $AUDIO_COUNT"

if (( AUDIO_COUNT > 0 )); then
    for ((i = 0; i < AUDIO_COUNT; i++)); do
        MIME="$(
          jq -r --argjson i "$i" '
            [
              .steps[]?
              | select(.type == "model_output")
              | .content[]?
              | select(.type == "audio" and .data != null)
            ][$i].mime_type // "audio/mp3"
          ' "$RAW"
        )"

        case "$MIME" in
            audio/wav)
                EXT="wav"
                ;;
            audio/mp3|audio/mpeg)
                EXT="mp3"
                ;;
            *)
                EXT="bin"
                ;;
        esac

        AUDIO="$OUT_DIR/audio-${MODEL}-pdf-${i}.${EXT}"

        jq -r --argjson i "$i" '
          [
            .steps[]?
            | select(.type == "model_output")
            | .content[]?
            | select(.type == "audio" and .data != null)
          ][$i].data
        ' "$RAW" | base64 -d > "$AUDIO"

        echo "wrote audio block $i: $AUDIO ($MIME)"
    done
fi

echo
echo "usage:"
jq '.usage // {}' "$RAW"
