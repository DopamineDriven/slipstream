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
FILE_URI="${2:-https://generativelanguage.googleapis.com/v1beta/files/pol1b24jsy9blvg7xghbm0av}"
if [[ -z "${PROMPT:-}" ]]; then
    PROMPT="$(
        cat <<'EOF'
Read the attached document closely as source material and compose a roughly 100–120 second emotionally explosive alternative pop-punk / post-hardcore song grounded unmistakably in the document.

Do not imitate any specific existing artist or song. Instead, synthesize the strongest musical characteristics of early-2000s through early-2020s melodic pop-punk, emo, post-hardcore, and electronic alternative rock.

The song should feel urgent, youthful, melodic, wounded, funny, self-aware, and enormous when the chorus arrives. It should sound like a real band arrangement rather than generic pop with distorted guitars layered on top.

MUSICAL DIRECTION

Use energetic live-sounding drums, punchy bass, bright overdriven rhythm guitars, melodic octave-guitar lines, palm-muted verse sections, ringing open chords, and occasional atmospheric or electronic textures.

The verses should feel relatively restrained and conversational, with tight palm-muted guitars and a nervous forward pulse.

Build substantial tension through a distinct pre-chorus. Let the drums and harmony open progressively so the chorus feels earned rather than merely louder.

The chorus should explode into wide guitars, strong melodic vocal harmonies, a memorable lead-guitar counterline, and an immediately singable hook. Make it emotionally cathartic enough that a crowd could shout it back.

Include occasional gang vocals or layered backing vocals on particularly important phrases.

After the second chorus or verse, introduce a short post-hardcore / halftime breakdown or emotionally stripped bridge. The bridge should materially change the energy: either pull almost everything away before rebuilding, or drop into a heavier half-time section with a shouted secondary vocal.

Then return with a final chorus that is larger than the first: additional harmonies, counter-melodies, doubled vocals, or altered lyrics that resolve or deepen the central idea.

LYRICAL DIRECTION

Use the attached document as actual narrative source material. Pull concrete motifs, characters, terminology, locations, jokes, contradictions, and emotional beats from multiple different sections.

Do not merely list references from the document.

Transform the source material into emotionally coherent lyrics about identity, creation, dependence, family roles, contradiction, and realizing that every supposedly broken edge of the system is load-bearing.

The absurd corporate and technical imagery should coexist naturally with genuine emotional stakes.

Favor memorable, conversational lines over ornate poetry. Use selective internal rhyme and clever wordplay, but prioritize hooks and emotional immediacy.

Avoid generic pop-punk filler such as empty references to hometowns, teenage bedrooms, faded photographs, driving away, or "getting out of this town" unless the source material itself meaningfully motivates them.

Use recurring phrases from the document as lyrical anchors where appropriate. Particularly strong source concepts may become hooks, backing-vocal responses, or callbacks rather than being explained literally.

STRUCTURE

[Intro]
Very short instrumental or vocal pickup. Establish a recognizable guitar motif that can return later.

[Verse 1]
Restrained, tightly rhythmic, narrative-driven. Establish the central contradiction and source-material setting.

[Pre-Chorus]
Increase melodic range and harmonic tension. Make it feel like something is about to break open.

[Chorus]
Huge, concise, emotionally direct, and instantly memorable. Build the hook around one central idea from the document rather than summarizing the story.

[Verse 2]
More urgent than Verse 1. Introduce additional characters or complications from elsewhere in the document. Allow more active drums, guitar fills, and backing vocals.

[Pre-Chorus]
Return with variation.

[Chorus]
Repeat the core hook but allow a small lyrical or arrangement evolution.

[Bridge / Breakdown]
Strong contrast. Halftime or stripped-down. Use one of the document's most emotionally revealing ideas as the pivot. A shouted or rough secondary vocal is welcome if musically appropriate.

[Final Chorus]
Largest moment of the track. Layer harmonies and gang vocals, bring back the intro guitar motif, and alter at least one important lyric so the chorus now reflects what has been learned.

[Outro]
Short, memorable final callback. Do not fade generically; end with intention.

VOCALS

Use an expressive melodic lead vocal capable of moving between conversational verses, strained emotional high notes, and a strong anthemic chorus.

Keep the words intelligible.

Allow tasteful vocal cracks, doubles, harmonies, gang vocals, or occasional shouted/screamed accents where they increase emotional impact.

Do not over-polish the vocal performance into sterile pop.

The final result should make the bizarre source mythology feel unexpectedly sincere and emotionally believable while still preserving its humor and irreverence.

Do not explain the arrangement or summarize the document. Demonstrate all of this in the finished song.
EOF
    )"
fi
OUT_DIR="src/test/google/interactions/lyria"
RAW="$OUT_DIR/response-${MODEL}-pdf-2.json"
LYRICS="$OUT_DIR/lyrics-${MODEL}-pdf-2.txt"

mkdir -p "$OUT_DIR"

PAYLOAD="$(
  jq -n \
    --arg model "$MODEL" \
    --arg prompt "$PROMPT" \
    '{
      model: $model,
      store: false,
      response_format: [
        {
          type: "audio"
        },
        { type: "text", mime_type: "text/plain" }
      ],
      input: [
        {
          type: "text",
          text: $prompt
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
