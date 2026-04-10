# Plan: TTS Primer Audio Accumulation Fix + ttsJob Cache Hydration

## Context

Two client-side problems in the message-bubble TTS flow:

1. **Primer audio accumulation**: Every `MessageIcons` mount creates `new Audio("/cassette-shortened.mp3")` with `preload = "auto"` (line 52-67), **regardless of whether the message already has a completed ttsJob**. In a long conversation with 50+ messages, that's 50+ audio elements preloading the same mp3. This surfaced after adding the Safari AudioSession workaround — the primer registration works but accumulates on every message that doesn't yet have a ttsJob coupled with it.

2. **ttsJob data completely unused**: Messages load from DB with `ttsJob` containing `cdnUrl`, `durationMs`, `codec`, `status` — but no component reads it. `hasCachedAudio()` exists on TTSContext but is never called. Clicking "Read Aloud" on a message with a completed TTS job fires a new websocket request → server checks → returns `user_tts_response_preexisting` — an unnecessary round-trip.

These compound: if we hydrate the cache from ttsJob, messages with existing TTS skip the primer entirely (cache hit → instant CDN playback). Messages without ttsJob still need the primer, but we can create it on-demand in the click handler instead of preloading on mount.

## Changes

### Step 1: `apps/web/src/context/tts-context.tsx` — Add cache hydration

**1a.** Add `TTSJobSingleton` to the type import from `@slipstream/types` (line 19-25)

**1b.** Add `hydrateFromTtsJob` to `TTSContextValue` interface (after `hasCachedAudio` at line 53):
```ts
hydrateFromTtsJob: (messageId: string, ttsJob: TTSJobSingleton<true>) => void;
```

**1c.** Add `hydrateFromTtsJob` callback after `hasCachedAudio` (after line 339). Uses the existing `isValidCodec` (already imported at line 18) for validation:
```ts
const hydrateFromTtsJob = useCallback(
  (messageId: string, ttsJob: TTSJobSingleton<true>) => {
    if (ttsJob.status !== "COUPLED") return;
    if (ttsJob.cdnUrl == null) return;
    if (ttsJob.durationMs == null) return;
    if (!isValidCodec(ttsJob.codec)) return;
    if (cacheRef.current.has(messageId)) return;

    cacheRef.current.set(messageId, {
      cdnUrl: ttsJob.cdnUrl,
      blobUrl: null,
      durationMs: ttsJob.durationMs,
      codec: ttsJob.codec
    } satisfies TTSCacheEntry);
  },
  []
);
```
- Empty deps: only reads `cacheRef` (stable ref) and `isValidCodec` (module-scoped)
- `blobUrl: null` — no local blob for pre-existing jobs; `play()` prefers `cdnUrl` already
- Idempotent: skips if already cached

**1d.** Add `hydrateFromTtsJob` to the `value` useMemo object and its dependency array (~line 341-377)

---

### Step 2: `apps/web/src/ui/chat/message-bubble/message-icons.tsx` — Fix primer accumulation, add hydration

**2a.** Add ttsJob hydration `useEffect` after `const tts = useTTSContext()` (line 43):
```ts
useEffect(() => {
  if (message.ttsJob) {
    tts.hydrateFromTtsJob(message.id, message.ttsJob);
  }
}, [message.id, message.ttsJob, tts]);
```
This seeds the cache on mount for messages with completed ttsJobs, making the `requestTTS` cache check (tts-context line 266) a hit → instant CDN playback, no primer needed.

**2b.** Guard primer prefetch to skip messages that already have cached audio (line 52-67). The primer is only useful for messages where TTS hasn't been generated yet:
```ts
useEffect(() => {
  if (isMobile) return;
  if (cacheRef.current.has(message.id)) return;  // already hydrated from ttsJob
  if (primerRef.current) return;
  // ... rest unchanged
}, [isMobile, message.id]);
```

Wait — `cacheRef` is internal to tts-context, not accessible here. Instead, use `tts.hasCachedAudio(message.id)`:
```ts
useEffect(() => {
  if (isMobile) return;
  if (tts.hasCachedAudio(message.id)) return;
  if (primerRef.current) return;
  const el = new Audio(primerAudio);
  el.volume = 0.1;
  el.preload = "auto";
  el.onended = () => {
    hasPlayedPrimer.current = true;
  };
  primerRef.current = el;

  return () => {
    el.onended = null;
    el.pause();
    primerRef.current = null;
  };
}, [isMobile, tts, message.id]);
```
This eliminates primer accumulation for all messages that have existing ttsJobs. Messages without ttsJobs still get the primer preloaded on desktop.

**2c.** Accept `isMobile` as a prop instead of calling `useIsMobile()` independently. Remove the import and call, add to props interface. This keeps a single source of truth from `MessageBubble` and avoids rendering desktop-only action buttons on mobile (conditional render instead of CSS hide):

- Remove `import { useIsMobile } from "@/hooks/use-is-mobile"` (line 7)
- Remove `const isMobile = useIsMobile()` (line 40)
- Add `isMobile: boolean` to props
- Change AI action row (line 141-222): `{!isMobile && (<div className="flex items-center gap-2">...`)}`
- Change USER action row (line 245-261): same pattern

---

### Step 3: `apps/web/src/ui/chat/message-bubble/index.tsx` — Pass isMobile prop

**3a.** Pass `isMobile` to `MessageIcons` (line 689-693):
```diff
  <MessageIcons
+   isMobile={isMobile}
    isStreaming={isStreaming}
    message={message}
    user={user}
  />
```

---

## Files touched (3 total, client-only)

| File | Changes |
|------|---------|
| `apps/web/src/context/tts-context.tsx` | Add `hydrateFromTtsJob` method to context |
| `apps/web/src/ui/chat/message-bubble/message-icons.tsx` | Accept `isMobile` prop, hydration effect, primer guard, conditional render |
| `apps/web/src/ui/chat/message-bubble/index.tsx` | Pass `isMobile={isMobile}` to MessageIcons |

## What this does NOT change

- `actions-dialog.tsx` — remains the sole mobile TTS entry point, unchanged
- `use-is-mobile.ts` — hook implementation unchanged (cookie-based, stable)
- Websocket server, API routes, event contracts — all out of scope
- Desktop behavior for messages without ttsJob — still preloads primer as before

## Key behaviors after fix

| Message state | On load | On "Read Aloud" click |
|---|---|---|
| Has ttsJob (COUPLED) | Cache hydrated from ttsJob, NO primer preloaded | Cache hit → instant CDN playback, no websocket request |
| No ttsJob (desktop) | Primer preloaded as before | Primer plays → websocket TTS request → streaming |
| No ttsJob (mobile) | No primer preloaded (mobile guard) | Mobile dialog handles its own primer → websocket TTS request |

## Verification

1. `pnpm typecheck` — no errors
2. Load conversation with completed ttsJobs → "Read Aloud" plays immediately from CDN, no websocket request
3. Load conversation without ttsJobs → "Read Aloud" plays primer then streams via websocket (unchanged behavior)
4. Mobile: only mobile dialog path works, desktop action row not in DOM
5. Long conversation: inspect audio element count — should be dramatically reduced (only messages without ttsJobs get primer elements on desktop)
