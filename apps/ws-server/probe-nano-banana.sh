#!/usr/bin/env bash
set -euo pipefail

# Raw streamed Interactions probe for Gemini 3.1 Flash Image / Nano Banana 2.
#
# Uses the same PDF previously tested with Lyria 3 Pro.
# Preserves the complete raw SSE so we can inspect:
#   - thought steps / summaries / signatures
#   - text output
#   - image output
#   - lifecycle / usage events
#
# No max_output_tokens is specified.

if [ -z "${GOOGLE_API_KEY:-}" ]; then
    if [ -f .env ]; then
        export $(grep -v '^#' .env | grep -v '^$' | xargs)
    else
        echo "Error: GOOGLE_API_KEY unset and no .env file found"
        exit 1
    fi
fi

MODEL="${1:-gemini-3.1-flash-image}"
FILE_URI="${2:-https://generativelanguage.googleapis.com/v1beta/files/oduol63398grr9t4pd5i5jkh}"
THINKING="${3:-high}"
ASPECT_RATIO="${4:-16:9}"
IMAGE_SIZE="${5:-2K}"

SYSTEM_PROMPT="${SYSTEM_PROMPT:-}"

PROMPT="${PROMPT:-Read the attached PDF as source material and create a detailed illustration grounded in its themes, imagery, characters, recurring motifs, and emotional tone. Treat the image as a visual adaptation of the document rather than a generic interpretation. Draw concrete details from across the document and synthesize them into a coherent scene. Alongside the image, briefly describe the visual concept you chose to depict.}"

OUT_DIR="src/test/google/interactions/nano-banana-2/pdf"
OUT="$OUT_DIR/sse-${MODEL}-${THINKING}-pdf.txt"

mkdir -p "$OUT_DIR"

PAYLOAD="$(
  jq -n \
    --arg model "$MODEL" \
    --arg file_uri "$FILE_URI" \
    --arg thinking "$THINKING" \
    --arg aspect_ratio "$ASPECT_RATIO" \
    --arg image_size "$IMAGE_SIZE" \
    --arg system_instruction "$SYSTEM_PROMPT" \
    --arg prompt "$PROMPT" \
    '
    {
      model: $model,
      store: false,

      input: [
        {
          type: "user_input",
          content: [
            {
              type: "text",
              text: $prompt
            },
            {
              type: "document",
              uri: $file_uri,
              mime_type: "application/pdf"
            }
          ]
        }
      ],

      response_format: [
        {
          type: "image",
          mime_type: "image/jpeg",
          aspect_ratio: $aspect_ratio,
          image_size: $image_size
        },
        {
          type: "text",
          mime_type: "text/plain"
        }
      ],

      stream: true,

      generation_config: {
        tool_choice: "auto",
        thinking_summaries: "auto",
        thinking_level: $thinking
      }
    }

    | if ($system_instruction | length) > 0
      then .system_instruction = $system_instruction
      else .
      end
    '
)"

echo "model:       $MODEL"
echo "file uri:    $FILE_URI"
echo "thinking:    $THINKING"
echo "aspect:      $ASPECT_RATIO"
echo "image size:  $IMAGE_SIZE"
echo "output:      $OUT"
echo

curl -sS \
  --fail-with-body \
  --no-buffer \
  'https://generativelanguage.googleapis.com/v1beta/interactions' \
  -H "x-goog-api-key: ${GOOGLE_API_KEY}" \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  --data-binary "$PAYLOAD" \
  | tee "$OUT"

echo
echo
echo "wrote raw SSE: $OUT"
