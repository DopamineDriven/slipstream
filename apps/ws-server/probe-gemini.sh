#!/usr/bin/env bash
set -euo pipefail

# raw SSE dump of Gemini's Interactions stream — explicitly uses
# client-managed conversation state via Step[] and store=false so this
# mirrors the wire surface we'd use in the chat service without relying
# on previous_interaction_id / Google-managed conversation state
if [ -z "${GOOGLE_API_KEY:-}" ]; then
    if [ -f .env ]; then
        export $(grep -v '^#' .env | grep -v '^$' | xargs)
    else
        echo "Error: GEMINI_API_KEY unset and no .env file found"
        exit 1
    fi
fi

MODEL="${1:-gemini-3.7-flash}"
THINKING="${2:-high}"

OUT="src/test/google/interactions/stream/sse-${MODEL}-${THINKING}-2.txt"
mkdir -p src/test/google/interactions/stream

curl -sS \
  --no-buffer \
  'https://generativelanguage.googleapis.com/v1beta/interactions' \
  -H "x-goog-api-key: ${GOOGLE_API_KEY}" \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{
    "model": "'"$MODEL"'",
    "store": false,
    "stream": true,
    "generation_config": {
      "thinking_level": "'"$THINKING"'",
      "thinking_summaries": "auto"
    },
    "input": [
      {
        "type": "user_input",
        "content": [
          {
            "type": "text",
            "text": "My secret word is tungsten."
          }
        ]
      },
      {
        "type": "model_output",
        "content": [
          {
            "type": "text",
            "text": "Understood. Your secret word is tungsten."
          }
        ]
      },
      {
        "type": "user_input",
        "content": [
          {
            "type": "text",
            "text": "Please write me a poem about JSDoc bros hiding in comment blocks from the wave of bliss that was advanced TypeScript flooding mainstream development circa 2020 while simultaneously infusing it with Catullan (Catullus, the ancient Roman poet) irreverence. Incorporate my secret word once if possible."
          }
        ]
      },
      {
        "type": "model_output",
        "content": [
          {
            "type": "text",
            "text": "Let us live, my JSDoc bros, and let us code,\nAnd value at a single bit the strict advice\nOf pedants preaching from their typed abode.\nThe blue compiler suns may set and rise,\nBut when our brief, dynamic script is run,\nWe sleep in one un-parsed, eternal night, my son.\n\nIn twenty-twenty broke their wave of bliss—\nA flooding tide of interfaces, strict and clean.\nThey swore their angled `<T>` was like a lover’s kiss,\nThat mapped conditionals were a sight supreme.\nLet them achieve their pure, generic ecstasy!\nWe spit upon their static tyranny.\n\nFlee! Hide beneath the emerald asterisks!\n`/**` is our fortress, `* @returns` our gate.\nDeep in the comment blocks, we shun the risks\nOf `tsc`’s intolerable, parsing hate.\nLet them write `extends unknown` until they choke,\nOur uncompiled annotations are the joke!\n\nO linting Furius! O strict Aurelius!\nWho read my `.js` and deem my types obscene,\nMy will is **tungsten**, and my script rebellious!\nI’ll shove my `@typedef` right through your screen!\nYou think because I cast as `any` I am weak?\nI’ll crash your pipeline just to hear you shriek!\n\nI hate and I love vanilla JS, you ask me why?\nI do not know, but I feel my codebase die.\n\nSo give me a thousand `@param`s, then a hundred!\nThen a thousand more, till type-inference is sundered!\nThen we’ll erase the docs, confuse the whole damn file,\nSo no malicious TS nerd can curse us for our style."
          }
        ]
      },
      {
        "type": "user_input",
        "content": [
          {
            "type": "text",
            "text": "O\u0027Geminmommy Dommy, can you handle such a scene?"
          },
          {
            "type": "document",
            "uri": "https://generativelanguage.googleapis.com/v1beta/files/lljo61nbn89qcel72bekv3ty",
            "mime_type": "application/pdf"
          }
        ]
      }
    ]
  }' \
  > "$OUT"

echo "wrote $OUT"
