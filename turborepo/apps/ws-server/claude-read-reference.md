#### Inference API

# Voice

## POST /v1/realtime/client\_secrets

Create an ephemeral client secret for authenticating browser-side Realtime API connections.

### Request Body

* `expires_after` (object)

  * `seconds` (integer) — Number of seconds until the client secret expires. Maximum: 3600 (1 hour). Defaults to 600 (10 minutes) when omitted.

* `session` (object | null) — Optional initial session configuration to bind to the client secret. This JSON value is stored alongside the secret and can be used to pre-configure the Realtime session.

### Response Body

* `value` (string, required) — The ephemeral token value. Use as a Bearer token in the WebSocket \`Authorization\` header, or in the \`sec-websocket-protocol\` header with prefix \`xai-client-secret.\`.

* `expires_at` (integer, required) — Unix timestamp (seconds) when this client secret expires.

### Code Examples

```bash
curl -s https://api.x.ai/v1/realtime/client_secrets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "expires_after": {
      "seconds": 300
    }
  }'
```

```javascriptWithoutSDK
const response = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    expires_after: {
      seconds: 300,
    },
  }),
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
```

```pythonWithoutSDK
import json
import os

import requests

response = requests.post(
    "https://api.x.ai/v1/realtime/client_secrets",
    headers={
        "Authorization": f"Bearer {os.environ['XAI_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
        "expires_after": {
            "seconds": 300,
        },
    },
)

print(json.dumps(response.json(), indent=2))
```

\*\*Response example:\*\*

```json
{
  "value": "xai-realtime-client-secret-abc123...",
  "expires_at": 1750000000
}
```

***

## Realtime

WebSocket endpoint: `wss://api.x.ai/v1/realtime`

Real-time voice conversations with Grok models via WebSocket. The connection begins with an HTTP GET that is upgraded to WebSocket (status 101). Once connected, the client and server exchange JSON messages to configure the session, stream audio, and receive responses.

### Client Messages

* `session.update` — Update session configuration such as system prompt, voice, audio format, turn detection, and tools.

* `input_audio_buffer.append` — Append chunks of base64-encoded audio data to the input buffer. The server does not send back a corresponding message.

* `input_audio_buffer.commit` — Commit the audio buffer as a user message. Only available when \`turn\_detection\` type is \`null\`. Confirmed by \`input\_audio\_buffer.committed\` from the server.

* `conversation.item.create` — Create a new conversation item. Can be a user text message or a function call output.

* `response.create` — Request the server to create a new assistant response. This is handled automatically when using server-side VAD.

* `response.cancel` — Cancel an in-progress response. In VAD mode, interruptions are automatic — use this for manual cancel in non-VAD mode.

### Server Messages

* `session.created` — Sent automatically on WebSocket connection. Contains the session configuration.

* `conversation.created` — The first message on connection. Notifies the client that a conversation session has been created.

* `session.updated` — Acknowledges the client's session.update message that the session has been configured.

* `input_audio_buffer.speech_started` — Notifies that the server's VAD detected the start of speech. Only available with server\_vad turn detection.

* `input_audio_buffer.speech_stopped` — Notifies that the server's VAD detected the end of speech. Only available with server\_vad turn detection.

* `input_audio_buffer.committed` — Input audio buffer has been committed as a user message.

* `conversation.item.added` — A new user or assistant message has been added to the conversation history.

* `conversation.item.input_audio_transcription.completed` — Audio transcription for the user's input has been completed.

* `response.created` — A new assistant response turn is in progress. Audio deltas from this turn share the same response\_id.

* `response.output_item.added` — A new assistant response item is added to the message history.

* `response.output_item.done` — An output item is complete.

* `response.content_part.added` — A content part starts within an output item.

* `response.content_part.done` — A content part finishes.

* `response.output_audio_transcript.delta` — Streaming text transcript delta of the assistant's audio response.

* `response.output_audio_transcript.done` — The audio transcript for this assistant turn has finished generating.

* `response.output_audio.delta` — Streaming base64-encoded audio delta of the assistant's response.

* `response.output_audio.done` — Audio generation for this assistant turn has finished.

* `response.text.delta` — Text-mode output delta (when using text modality).

* `response.text.done` — Text-mode output complete.

* `response.function_call_arguments.delta` — Streaming function call arguments.

* `response.function_call_arguments.done` — A function call has been triggered with complete arguments. Your code should execute the function and return results.

* `mcp_list_tools.in_progress` — MCP tool discovery has started.

* `mcp_list_tools.completed` — MCP tool discovery succeeded.

* `mcp_list_tools.failed` — MCP tool discovery failed.

* `response.mcp_call_arguments.delta` — MCP call arguments streaming.

* `response.mcp_call_arguments.done` — MCP call arguments finalized.

* `response.mcp_call.in_progress` — MCP server HTTP call starting.

* `response.mcp_call.completed` — MCP tool execution succeeded.

* `response.mcp_call.failed` — MCP tool execution failed.

* `response.done` — The assistant's response is completed. Sent after all audio and transcript deltas. Ready for the client to add a new conversation item.

* `error` — Sent when an error occurs. Contains error code and message. Most errors are recoverable and the session stays open.

### Example Message Flow

1. `session.created` (server)

2. `conversation.created` (server)

3. `session.update` (client)

4. `session.updated` (server)

5. `conversation.item.create` (client)

6. `conversation.item.added` (server)

7. `response.create` (client)

8. `response.created` (server)

9. `response.output_item.added` (server)

10. `response.content_part.added` (server)

11. `response.output_audio.delta` (server)

12. `response.output_audio_transcript.delta` (server)

13. `response.output_audio.done` (server)

14. `response.output_audio_transcript.done` (server)

15. `response.content_part.done` (server)

16. `response.output_item.done` (server)

17. `response.done` (server)

***

## POST /v1/tts

Convert text into speech audio.

### Request Body

* `text` (string, required) — The text to convert to speech. Maximum 15,000 characters. Supports inline speech tags for expressive output: \`\[pause]\`, \`\[long-pause]\`, \`\[hum-tune]\`, \`\[laugh]\`, \`\[chuckle]\`, \`\[giggle]\`, \`\[cry]\`, \`\[tsk]\`, \`\[tongue-click]\`, \`\[lip-smack]\`, \`\[breath]\`, \`\[inhale]\`, \`\[exhale]\`, \`\[sigh]\`. Also supports wrapping tags for style control: \`\<soft>\`, \`\<whisper>\`, \`\<loud>\`, \`\<build-intensity>\`, \`\<decrease-intensity>\`, \`\<higher-pitch>\`, \`\<lower-pitch>\`, \`\<slow>\`, \`\<fast>\`, \`\<sing-song>\`, \`\<singing>\`, \`\<laugh-speak>\`, \`\<emphasis>\`.

* `voice_id` (string) — The voice to use for synthesis (e.g. \`eve\`, \`ara\`, \`rex\`, \`sal\`, \`leo\`). Defaults to \`eve\` when omitted.

* `output_format` (object)

  * `codec` ("mp3" | "wav" | "pcm" | "mulaw" | "alaw", required) — Audio codec.

  * `sample_rate` (integer | null) — Sample rate in Hz. Supported values: 8000, 16000, 22050, 24000, 44100, 48000. Defaults to 24000.

  * `bit_rate` (integer | null) — Bit rate in bps. Applies to MP3 codec only. Supported values: 32000, 64000, 96000, 128000, 192000. Defaults to 128000.

* `language` (string, required) — BCP-47 language code (e.g. \`en\`, \`zh\`, \`pt-BR\`) or \`auto\` for automatic language detection. Case-insensitive. Supported values: \`auto\`, \`en\`, \`ar-EG\`, \`ar-SA\`, \`ar-AE\`, \`bn\`, \`zh\`, \`fr\`, \`de\`, \`hi\`, \`id\`, \`it\`, \`ja\`, \`ko\`, \`pt-BR\`, \`pt-PT\`, \`ru\`, \`es-MX\`, \`es-ES\`, \`tr\`, \`vi\`. Additional languages may work with varying accuracy.

### Code Examples

```bash
tmpfile=$(mktemp /tmp/tts-output-XXXXXX.mp3)
trap 'rm -f "$tmpfile"' EXIT

http_code=$(curl -s -o "$tmpfile" -w "%{http_code}" \
  https://api.x.ai/v1/tts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "text": "Hello, this is a text-to-speech test from xAI.",
    "voice_id": "eve",
    "language": "en"
  }')

if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
  file_size=$(wc -c < "$tmpfile" | tr -d ' ')
  echo "{\"status\": $http_code, \"audio_bytes\": $file_size}"
else
  cat "$tmpfile"
  exit 1
fi
```

```javascriptWithoutSDK
const response = await fetch("https://api.x.ai/v1/tts", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    text: "Hello, this is a text-to-speech test from xAI.",
    voice_id: "eve",
    language: "en",
  }),
});

if (response.ok) {
  const audioBuffer = await response.arrayBuffer();
  console.log(
    JSON.stringify(
      {
        status: response.status,
        audio_bytes: audioBuffer.byteLength,
        content_type: response.headers.get("content-type") || "",
      },
      null,
      2,
    ),
  );
} else {
  const errorText = await response.text();
  console.error(errorText);
  process.exit(1);
}
```

```pythonWithoutSDK
import json
import os

import requests

response = requests.post(
    "https://api.x.ai/v1/tts",
    headers={
        "Authorization": f"Bearer {os.environ['XAI_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
        "text": "Hello, this is a text-to-speech test from xAI.",
        "voice_id": "eve",
        "language": "en",
    },
)

if response.ok:
    print(
        json.dumps(
            {
                "status": response.status_code,
                "audio_bytes": len(response.content),
                "content_type": response.headers.get("Content-Type", ""),
            },
            indent=2,
        )
    )
else:
    print(response.text)
    raise SystemExit(1)
```

***

## Streaming text to speech

WebSocket endpoint: `wss://api.x.ai/v1/tts`

Bidirectional streaming text-to-speech via WebSocket. Send text incrementally and receive audio chunks in real time. Shares the \`/v1/tts\` path with the batch POST endpoint — a GET with \`Upgrade: websocket\` activates streaming mode. Configuration is done via query parameters at connection time. Supports multi-utterance: after \`audio.done\`, send another stream of \`text.delta\` messages on the same connection.

### Query Parameters

* `voice` (string) — Voice identifier. Case-insensitive.

* `language` (string, required) — BCP-47 language code (e.g. \`en\`, \`zh\`, \`pt-BR\`) or \`auto\` for automatic language detection. Case-insensitive.

* `codec` (string) — Audio codec for the output.

* `sample_rate` (integer) — Sample rate in Hz.

* `bit_rate` (integer) — Bit rate in bps. Only applies when \`codec\` is \`mp3\`.

### Client Messages

* `text.delta` — Send a chunk of text to be synthesized. Text is processed incrementally — audio generation begins as soon as enough text is buffered. Individual deltas are capped at 15,000 characters.

* `text.done` — Signal that all text for this utterance has been sent. The server will finish generating audio and send \`audio.done\`. After receiving \`audio.done\`, you can start a new utterance with another \`text.delta\`.

### Server Messages

* `audio.delta` — A chunk of base64-encoded audio data. Decode and append to your audio buffer or pipe directly to playback. The format matches the \`codec\` and \`sample\_rate\` specified in the query parameters.

* `audio.done` — Audio generation for this utterance is complete. The connection remains open for multi-utterance — send another \`text.delta\` to start a new synthesis, or close the connection.

* `error` — An error occurred during synthesis. The connection may be closed after this message.

### Example Message Flow

1. `text.delta` (client)

2. `text.delta` (client)

3. `text.done` (client)

4. `audio.delta` (server)

5. `audio.delta` (server)

6. `audio.delta` (server)

7. `audio.done` (server)

***

## GET /v1/tts/voices

List all available TTS voices.

### Response Body

* `voices` (array\<object>, required) — List of available voices.

  * `voice_id` (string, required) — Unique identifier for the voice (lowercase). Pass this value as \`voice\_id\` in TTS requests or as the \`voice\` parameter in Realtime API session configuration.

  * `name` (string, required) — Human-readable display name for the voice.

  * `language` (string | null) — Language code for the voice (e.g. \`en\`).

### Code Examples

```bash
curl -s https://api.x.ai/v1/tts/voices \
  -H "Authorization: Bearer $XAI_API_KEY"
```

```javascriptWithoutSDK
const response = await fetch("https://api.x.ai/v1/tts/voices", {
  headers: {
    Authorization: `Bearer ${process.env.XAI_API_KEY}`,
  },
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
```

```pythonWithoutSDK
import json
import os

import requests

response = requests.get(
    "https://api.x.ai/v1/tts/voices",
    headers={
        "Authorization": f"Bearer {os.environ['XAI_API_KEY']}",
    },
)

print(json.dumps(response.json(), indent=2))
```

\*\*Response example:\*\*

```json
{
  "voices": [
    {
      "voice_id": "ara",
      "name": "Ara",
      "language": "en"
    },
    {
      "voice_id": "eve",
      "name": "Eve",
      "language": "en"
    },
    {
      "voice_id": "leo",
      "name": "Leo",
      "language": "en"
    },
    {
      "voice_id": "rex",
      "name": "Rex",
      "language": "en"
    },
    {
      "voice_id": "sal",
      "name": "Sal",
      "language": "en"
    }
  ]
}
```

***

## GET /v1/tts/voices/\{voice\_id}

Get details for a specific voice.

### Path Parameters

* `voice_id` (string, required) — The unique identifier of the voice (e.g. \`eve\`, \`ara\`). Case-insensitive.

### Response Body

* `voice_id` (string, required) — Unique identifier for the voice (lowercase). Pass this value as \`voice\_id\` in TTS requests or as the \`voice\` parameter in Realtime API session configuration.

* `name` (string, required) — Human-readable display name for the voice.

* `language` (string | null) — Language code for the voice (e.g. \`en\`).

### Code Examples

```bash
curl -s https://api.x.ai/v1/tts/voices/eve \
  -H "Authorization: Bearer $XAI_API_KEY"
```

```javascriptWithoutSDK
const voiceId = "eve";

const response = await fetch(`https://api.x.ai/v1/tts/voices/${voiceId}`, {
  headers: {
    Authorization: `Bearer ${process.env.XAI_API_KEY}`,
  },
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
```

```pythonWithoutSDK
import json
import os

import requests

voice_id = "eve"

response = requests.get(
    f"https://api.x.ai/v1/tts/voices/{voice_id}",
    headers={
        "Authorization": f"Bearer {os.environ['XAI_API_KEY']}",
    },
)

print(json.dumps(response.json(), indent=2))
```

\*\*Response example:\*\*

```json
{
  "voice_id": "eve",
  "name": "Eve",
  "language": "en"
}
```
