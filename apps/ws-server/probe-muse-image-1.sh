#!/usr/bin/env bash
set -euo pipefail

# raw SSE dump of muse-image-1.0 on Meta's Responses endpoint, invoked
# directly with image_generation as its only tool. curl, not the OpenAI SDK:
# the SDK normalises the stream, and the point here is what api.meta.ai
# actually emits — the event names, which field carries the base64, and
# whether partial_images is honoured or ignored.
#
#   ./probe-muse-image-1.sh [model] [reasoning_strength] [partial_images] [size] [output_format]
#   PROMPT="a red fox in snow" ./probe-muse-image-1.sh muse-image-1.0 high 3
#   ANALYZE_ONLY=1 ./probe-muse-image-1.sh      # re-summarise the last dump, no request

if [ -z "${LLAMA_API_KEY:-}" ]; then
    if [ -f .env ]; then
        export $(grep -v '^#' .env | grep -v '^$' | xargs)
    else
        echo "Error: LLAMA_API_KEY unset and no .env file found"
        exit 1
    fi
fi

MODEL="${1:-muse-image-1.0}"
STRENGTH="${2:-high}"
PARTIALS="${3:-2}"
SIZE="${4:-1536x1024}"
FORMAT="${5:-png}"

if [[ -z "${PROMPT:-}" ]]; then
    PROMPT="a red fox trotting through fresh snow at golden hour, film photograph"
fi

OUT_DIR="src/test/meta/__out__"

# strength is in the stem so a high run never overwrites the low baseline
STEM="${MODEL}-${STRENGTH}"

SSE_RAW="$OUT_DIR/response-${STEM}-stream-sse.txt"
HEADERS="$OUT_DIR/response-${STEM}-stream-headers.txt"
PAYLOAD_FILE="$OUT_DIR/request-${STEM}-stream.json"
EVENTS="$OUT_DIR/events-${STEM}.ndjson"
REDACTED="$OUT_DIR/events-${STEM}-redacted.ndjson"
SUMMARY="$OUT_DIR/summary-${STEM}.json"
# the one file to read: the stream exactly as it came off the wire, with only
# the base64 payloads swapped for a length marker
SCANNABLE="$OUT_DIR/response-${STEM}-stream-sse-scannable.txt"

# a string this long is a payload, not prose — reasoning summaries run to ~1 KB
LONG=8192

mkdir -p "$OUT_DIR"

if [[ -z "${ANALYZE_ONLY:-}" ]]; then
    PAYLOAD="$(
        jq -n \
            --arg model "$MODEL" \
            --arg prompt "$PROMPT" \
            --arg strength "$STRENGTH" \
            --arg size "$SIZE" \
            --arg format "$FORMAT" \
            --argjson partials "$PARTIALS" \
            '{
                model: $model,
                stream: true,
                store: false,
                input: $prompt,
                tools: [
                    {
                        type: "image_generation",
                        size: $size,
                        output_format: $format,
                        reasoning_strength: $strength,
                        partial_images: $partials,
                        enable_web_search: true,
                        enable_shell: true,
                        enable_image_search: true
                    }
                ]
            }'
    )"

    printf '%s\n' "$PAYLOAD" | jq . > "$PAYLOAD_FILE"

    echo "model:   $MODEL"
    echo "payload: $PAYLOAD_FILE"
    echo "SSE:     $SSE_RAW"
    echo "headers: $HEADERS"
    echo
    echo "starting stream..."
    echo

    CURL_OUT="$(
        curl \
            --no-buffer \
            --silent \
            --show-error \
            --dump-header "$HEADERS" \
            --request POST \
            'https://api.meta.ai/v1/responses' \
            --header "Authorization: Bearer ${LLAMA_API_KEY}" \
            --header 'Content-Type: application/json' \
            --header 'Accept: text/event-stream' \
            --data-binary "$PAYLOAD" \
            --output "$SSE_RAW" \
            --write-out '%{http_code} %{time_starttransfer} %{time_total}'
    )"

    read -r HTTP_STATUS TTFB TOTAL <<< "$CURL_OUT"

    echo "HTTP $HTTP_STATUS  (first byte ${TTFB}s, total ${TOTAL}s)"
    echo "wrote raw SSE: $SSE_RAW"
    echo "wrote headers: $HEADERS"

    if [[ "$HTTP_STATUS" -lt 200 || "$HTTP_STATUS" -ge 300 ]]; then
        echo
        echo "muse-image request failed:"
        jq . "$SSE_RAW" 2>/dev/null || cat "$SSE_RAW"
        exit 1
    fi
fi

if [[ ! -s "$SSE_RAW" ]]; then
    echo "Error: no SSE dump at $SSE_RAW"
    exit 1
fi

# a text substitution, not a jq re-parse: framing, key order, whitespace and
# every short value stay byte-for-byte. Only a quoted base64 run of $LONG+
# characters is replaced, so ids and tokens survive intact
tr -d '\r' < "$SSE_RAW" \
    | LONG="$LONG" perl -pe '
        s{"([A-Za-z0-9+/=_-]{$ENV{LONG},})"}
         {"\"<base64 len=" . length($1) . " head=" . substr($1, 0, 16) . ">\""}ge
      ' \
    > "$SCANNABLE"

# data: lines → one JSON event per line (CR stripped, [DONE] dropped)
tr -d '\r' < "$SSE_RAW" \
    | grep '^data:' \
    | sed 's/^data:[[:space:]]*//' \
    | grep -v '^\[DONE\]$' \
    > "$EVENTS" \
    || true

echo
echo "SSE event: names (the wire's own event: lines):"
tr -d '\r' < "$SSE_RAW" \
    | grep '^event:' \
    | sed 's/^event:[[:space:]]*//' \
    | sort \
    | uniq -c \
    || true

echo
echo "JSON .type, in arrival order:"
jq -r '.type // "<no type field>"' "$EVENTS" | awk '{ printf "%4d  %s\n", NR - 1, $0 }'

echo
echo "JSON .type counts:"
jq -r '.type // "<no type field>"' "$EVENTS" | sort | uniq -c

# every event with long strings replaced by a marker — safe to open in an editor
jq -c --argjson long "$LONG" '
    walk(
        if type == "string" and length > $long
        then "<string len=\(length) head=\(.[0:16])>"
        else .
        end
    )
' "$EVENTS" > "$REDACTED"

echo
echo "where the base64 lives (event type → paths holding a long string):"
jq -c -n --argjson long "$LONG" '
    [ inputs
      | { type: (.type // "<no type field>"),
          paths: [ paths(type == "string" and length > $long)
                   | map(tostring) | join(".") ] }
      | select(.paths | length > 0)
    ]
    | group_by(.type)
    | map({ type: .[0].type, events: length, paths: (map(.paths) | add | unique) })
    | .[]
' "$EVENTS"

PARTIAL_COUNT="$(jq -r 'select((.type // "") | test("partial")) | .type' "$EVENTS" | wc -l | tr -d ' ')"

echo
echo "partial_images requested: $PARTIALS"
echo "partial events received:  $PARTIAL_COUNT"

echo
echo "output items on the terminal event (redacted):"
jq -c '
    select(.type == "response.completed" or .type == "response.incomplete" or .type == "response.failed")
    | { type,
        status: .response.status,
        error: .response.error,
        incomplete_details: .response.incomplete_details,
        output: [ .response.output[]? | with_entries(select(.key != "result" or (.value | type) != "string")) + { result_present: (.result != null) } ],
        usage: .response.usage }
' "$REDACTED"

# decode every base64 image found anywhere in the stream; the sha256 makes it
# obvious when output_item.done and response.completed carry the same bytes
echo
echo "images:"
IMAGE_INDEX=0
while IFS=$'\t' read -r EVENT_INDEX EVENT_TYPE IMAGE_PATH EXT B64; do
    [[ -z "${B64:-}" ]] && continue
    SAFE_PATH="$(printf '%s' "$IMAGE_PATH" | tr -c 'a-zA-Z0-9' '_')"
    FILE="$OUT_DIR/image-${STEM}-$(printf '%03d' "$EVENT_INDEX")-${SAFE_PATH}.${EXT}"
    printf '%s' "$B64" | base64 -d > "$FILE"
    SHA="$(sha256sum "$FILE" | cut -c1-12)"
    BYTES="$(wc -c < "$FILE" | tr -d ' ')"
    echo "  event $EVENT_INDEX  $EVENT_TYPE  .$IMAGE_PATH  →  $FILE  ($BYTES bytes, sha256 $SHA)"
    IMAGE_INDEX=$((IMAGE_INDEX + 1))
done < <(
    jq -r -n --argjson long "$LONG" '
        [ inputs ] | to_entries[]
        | .key as $i
        | .value as $ev
        | $ev
        | paths(type == "string" and length > $long) as $p
        | ($ev | getpath($p)) as $v
        | ( if   ($v | startswith("iVBOR")) then "png"
            elif ($v | startswith("/9j/"))  then "jpeg"
            elif ($v | startswith("UklGR")) then "webp"
            else empty end ) as $ext
        | [ $i, ($ev.type // "<no type field>"), ($p | map(tostring) | join(".")), $ext, $v ]
        | @tsv
    ' "$EVENTS"
)
echo "  $IMAGE_INDEX image(s) decoded"

jq -n \
    --arg model "$MODEL" \
    --argjson partialsRequested "$PARTIALS" \
    --argjson partialsReceived "$PARTIAL_COUNT" \
    --argjson long "$LONG" \
    --slurpfile events "$REDACTED" \
    --slurpfile raw "$EVENTS" \
    '{
        model: $model,
        totalEvents: ($events | length),
        partialsRequested: $partialsRequested,
        partialsReceived: $partialsReceived,
        order: [ $events[] | (.type // "<no type field>") ],
        counts: ( [ $events[] | (.type // "<no type field>") ]
                  | group_by(.) | map({ (.[0]): length }) | add ),
        base64Paths: ( [ $raw[]
                         | { type: (.type // "<no type field>"),
                             paths: [ paths(type == "string" and length > $long)
                                      | map(tostring) | join(".") ] }
                         | select(.paths | length > 0) ]
                       | group_by(.type)
                       | map({ (.[0].type): (map(.paths) | add | unique) }) | add ),
        firstOfEachType: ( [ $events[] ] | group_by(.type // "<no type field>") | map(.[0]) )
    }' > "$SUMMARY"

echo
echo "wrote scannable: $SCANNABLE   <- read this one"
echo "wrote events:   $EVENTS"
echo "wrote redacted: $REDACTED"
echo "wrote summary:  $SUMMARY"

echo
echo "SSE byte count:"
wc -c "$SSE_RAW"
