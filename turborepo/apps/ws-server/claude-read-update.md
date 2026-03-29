That plan is **not bad**, but it still sneaks in a little mini-framework around a flow that you already model elsewhere as “latest transient chunk, push, send, clear.” In the plan, `collectAudio(xaiWs, onChunk)` plus `connectAndStream(...)` plus resolver callback plumbing is functionally fine, but it is also exactly the sort of extra wrappering you were trying to strip out.  

You already have the important pieces:

* the shared app-level event contract already includes `user_tts_request / user_tts_chunk / user_tts_error / user_tts_response`, so there is no missing transport abstraction to invent 
* the client ws layer already validates and dispatches those TTS events, and already has a generic `send()` for typed outbound events 
* your Gemini stream already uses the exact transient-chunk pattern you want: `textPart`/`thinkingPart` is assigned, checked, pushed into aggregates, sent immediately via `ws.send(...)`, then the loop continues 

So I would keep TTS at roughly this level of stupidity:

```ts id="iqjdt1"
let audioChunk: string | undefined;
const audioBuffers: Buffer[] = [];
let traceId: string | undefined;

xaiWs.on("message", raw => {
  const event = JSON.parse<TTSTypes.Server>(raw.toString());

  if (event.type === "audio.delta") {
    audioChunk = event.delta;
  } else if (event.type === "audio.done") {
    traceId = event.trace_id;
  } else if (event.type === "error") {
    // fail job + send user_tts_error
  }

  if (audioChunk) {
    audioBuffers.push(Buffer.from(audioChunk, "base64"));

    ws.send(
      JSON.stringify({
        type: "user_tts_chunk",
        conversationId,
        messageId,
        audioChunk
      } satisfies EventTypeMap["user_tts_chunk"])
    );

    audioChunk = undefined;
  }

  if (traceId) {
    // concat/upload/persist/send user_tts_response
  }
});
```

That is much closer to your `chat.ts` streaming style than Claude’s callbackized version. In your Gemini code, you are already doing:

* transient part var
* `if (part)` aggregate
* `ws.send(...)`
* continue streaming

That pattern is already proven in your codebase. 

So my blunt recommendation is:

Keep:

* `openXaiConnection`
* `sendTextChunks`
* one parser for upstream xAI TTS frames
* one finalization step for S3 + attachment + `user_tts_response`

Drop or collapse:

* `collectAudio(xaiWs, onChunk)`
* `connectAndStream(...)` returning a custom lifecycle union with stage bookkeeping
* any extra callback threading whose only job is eventually doing `ws.send(user_tts_chunk)`

In other words, instead of:

```txt id="06h15i"
resolver
  -> connectAndStream
    -> collectAudio
      -> onChunk
        -> ws.send
```

prefer:

```txt id="a72h6g"
resolver
  -> ttsService.streamToClient(...)
    -> xaiWs.on("message")
      -> if (audioChunk) ws.send(user_tts_chunk)
      -> if (done) finalize + send user_tts_response
```

That still respects your architecture:

* client stays on the shared `EventTypeMap` contract 
* resolver still owns orchestration entrypoint and is already wired for `user_tts_request` 
* service still owns xAI-specific websocket details

It just stops pretending this needs three nested abstractions.

So yes: the simplest version is the right version here. Claude’s plan kept drifting back toward “clean architecture ceremony,” while your working pattern is already sitting in `chat.ts` and is simpler. 
