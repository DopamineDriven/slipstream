# Deep research on Slipstream message-bubble TTS listeners and iOS dual-invocation bug

## Executive summary

The three files in `apps/web/src/ui/chat/message-bubble/*` implement **two separate “Read Aloud” entry points** for the same message: a **desktop action row** (`MessageIcons`) and a **mobile actions dialog** (`MessageActionsDialog`). The mobile entry point is opened via the ellipsis (“message options”) button rendered by `MessageBubble` when `useIsMobile()` is true. fileciteturn43file0L79-L90 fileciteturn43file0L563-L577

The root problem on iPhone for long conversations is not that iOS is “random,” but that the current implementation:

- **Computes “mobile vs desktop” twice per message** (one `useIsMobile()` in `MessageBubble`, a second `useIsMobile()` inside `MessageIcons`). fileciteturn43file0L79-L90 fileciteturn37file0L40-L43  
- Each `useIsMobile()` instance registers **global window listeners** (`resize`, `orientationchange`). In a long conversation, this becomes *many* global listeners, increasing timing/race potential for state updates (and making transient UI-state skew more likely). fileciteturn39file0L31-L41  
- On touch devices, browsers may dispatch **emulated mouse/click events** for single-touch interactions, meaning “one tap” can involve multiple event types and sequencing concerns. citeturn2search4  
- When two different UI surfaces can be “live” for the same action (desktop row vs mobile dialog), the TTS request can be triggered twice in close succession, and the current TTS layer’s “double-request guard” is **ref-based and updated via an effect** (not synchronously), making it easier for back-to-back invocations to slip through if they occur within the same task/frame. fileciteturn40file0L94-L100 fileciteturn40file0L263-L295

The **surgical fix**: make `MessageBubble` the single source of truth for `isMobile` and pass it to `MessageIcons`, then **do not render (not merely hide)** the desktop action-row buttons (and their audio primer prefetch) when `isMobile === true`. This prevents the dual desktop+mobile listener surface from existing on iOS while keeping desktop behavior unchanged.

Unspecified constraints noted: app version, iOS version, and whether Safari is in “Request Desktop Website” mode are not provided.

## Scope and files reviewed

The directory contains exactly three files found and opened via the GitHub connector:

- `apps/web/src/ui/chat/message-bubble/index.tsx` (exports `MessageBubble`) fileciteturn5file0L1-L1  
- `apps/web/src/ui/chat/message-bubble/actions-dialog.tsx` (exports `MessageActionsDialog`) fileciteturn5file1L1-L1  
- `apps/web/src/ui/chat/message-bubble/message-icons.tsx` (exports `MessageIcons`) fileciteturn5file2L1-L1  

To trace the full audio/TTS pipeline (requested), I additionally followed references into:

- `apps/web/src/context/tts-context.tsx` (TTS request/playback, PCM streaming, Safari AudioSession behavior) fileciteturn40file0L1-L16  
- `apps/web/src/lib/pcm-stream-player.ts` (WebAudio PCM streamer; `navigator.audioSession.type = "playback"`) fileciteturn41file0L1-L33  
- `apps/web/src/lib/audio-session.ts` (Safari version gating for AudioSession support) fileciteturn42file0L1-L21  
- `apps/web/src/hooks/use-is-mobile.ts` (mobile detection + global window listeners) fileciteturn39file0L1-L41  

## Event listener registration and invocation paths

### Current registration points

**Mobile detection and its global listeners**

`useIsMobile()` attaches `window.addEventListener("resize", ...)` and `window.addEventListener("orientationchange", ...)` for each hook instance. fileciteturn39file0L31-L41  
It computes a result from a “viewport” cookie override and a touch+`vmin < 500` heuristic. fileciteturn39file0L10-L29

**Per-message UI “entry points” for TTS**

- Mobile entry: `MessageBubble` renders an ellipsis button when `isMobile` is true; clicking it sets local state to open a dialog. fileciteturn43file0L79-L90 fileciteturn43file0L563-L577  
- The dialog renders a Read Aloud button bound to `handleReadAloud`. fileciteturn36file0L150-L161  
- Desktop entry: `MessageIcons` renders a Read Aloud icon button in its action row, calling its own `handleReadAloud`. fileciteturn37file0L188-L199  

**Key design issue:** `MessageIcons` independently calls `useIsMobile()` (a second instance), and uses it to hide/show the desktop action row via CSS class logic. fileciteturn37file0L40-L43 fileciteturn37file0L140-L143  

### Mermaid flowchart of current vs proposed invocation

```mermaid
flowchart TD
  subgraph Current
    MB[MessageBubble] -->|useIsMobile (instance A)| IM_A[isMobile_A]
    MB -->|if isMobile_A| ELL[Ellipsis button]
    ELL -->|onClick| OPEN[setShowMobileActions(true)]
    OPEN --> MAD[MessageActionsDialog]
    MAD -->|onClick ReadAloud| RA_M[Mobile ReadAloud handler]

    MB --> MI[MessageIcons]
    MI -->|useIsMobile (instance B)| IM_B[isMobile_B]
    MI -->|if !isMobile_B| RA_D[Desktop ReadAloud handler]

    RA_M --> TTS[tts.requestTTS()]
    RA_D --> TTS
  end

  subgraph Proposed
    MB2[MessageBubble] -->|useIsMobile (single source)| IM2[isMobile]
    MB2 --> MI2[MessageIcons(isMobile)]
    MI2 -->|if !isMobile render action row| RA_D2[Desktop ReadAloud handler]
    MI2 -->|if isMobile render no action row| NO_D[No desktop listener surface]

    MB2 -->|if isMobile| ELL2[Ellipsis button]
    ELL2 --> MAD2[MessageActionsDialog]
    MAD2 --> RA_M2[Mobile ReadAloud handler]
    RA_M2 --> TTS2[tts.requestTTS()]
    RA_D2 --> TTS2
  end
```

## Audio prefetch and playback flow

### Cassette click “primer” prefetch

Both desktop and mobile TTS entry points use the same short sound (`/cassette-shortened.mp3`) as a primer:

- In `MessageIcons` (desktop path), a `new Audio(primerAudio)` is created on mount (`useEffect([])`), set to `preload = "auto"`, and marks a ref when it ends. fileciteturn37file0L49-L67  
- When Read Aloud is clicked, it attempts to play this primer before requesting TTS (unless already played). fileciteturn37file0L69-L78  

In `MessageActionsDialog` (mobile path), the primer audio is created only when the dialog is open, also with `preload = "auto"`, and is played immediately before `requestTTS`. fileciteturn36file0L59-L75 fileciteturn36file0L81-L91  

### TTS generation and playback, including Safari workaround

The user gesture (click/tap) triggers `tts.requestTTS(messageId, conversationId)` from either UI path. fileciteturn37file0L69-L78 fileciteturn36file0L81-L91  

In `TTSProvider`, `requestTTS` does:

- Cache check: if audio cached, it replays immediately. fileciteturn40file0L263-L269  
- Double-request guard: `if (isGeneratingRef.current) return;` (but note the ref is updated via an effect, not synchronously in the same call stack). fileciteturn40file0L94-L100 fileciteturn40file0L270-L277  
- Creates a `PCMStreamPlayer` and sends a websocket event requesting `"pcm"` audio. fileciteturn40file0L273-L294  

The PCM streaming player is explicitly designed to be created from a user gesture to satisfy autoplay policies. fileciteturn41file0L1-L7 The general browser rule that WebAudio playback is subject to autoplay policies (and thus should start in a user input handler) is described in MDN’s autoplay guide. citeturn0search5  

**Safari/iOS “AudioSession” workaround in this repo**

Two related mechanisms appear:

1. A Safari version gate (`Safari >= 16.4`) decides whether to enable the AudioSession behavior. fileciteturn42file0L1-L21  
2. When enabled, the code sets `navigator.audioSession.type = "playback"` via `PCMStreamPlayer.enablePlaybackAudioSession()`. fileciteturn41file0L22-L33  
   - MDN documents `Navigator.audioSession` and using `AudioSession.type`, including `"playback"`. citeturn0search0turn0search1turn0search2  

In this repo, enabling the `AudioSession` occurs:
- Before playing via the hidden `<audio>` element (`playFromUrl`) when Safari AudioSession is supported. fileciteturn40file0L102-L120  
- Also in the `PCMStreamPlayer` constructor if the Safari flag is true. fileciteturn41file0L14-L21  

## Why both desktop and mobile listeners can fire on iPhone in long conversations

### The concrete code conditions that permit overlap

At the message-bubble layer, there are *two separate “is this mobile?” computations*:

- `MessageBubble` computes `const isMobile = useIsMobile();` and uses it to decide whether to render the mobile ellipsis button (and thus the mobile dialog pathway). fileciteturn43file0L79-L90 fileciteturn43file0L563-L577  
- `MessageIcons` separately computes `const isMobile = useIsMobile();` and uses it to hide/show the desktop action row. fileciteturn37file0L40-L43 fileciteturn37file0L140-L143  

This duplication matters because each hook instance:

- Initializes state to `false` (desktop) until `checkIsMobile()` runs in its effect. fileciteturn39file0L6-L11 fileciteturn39file0L31-L35  
- Attaches its own global `resize`/`orientationchange` listeners. fileciteturn39file0L31-L41  

In a **long conversation**, you may have many `MessageBubble` and `MessageIcons` instances mounted at once. That means:
- Many independent global listeners (2 per `useIsMobile()` instance). fileciteturn39file0L31-L41  
- More main-thread work (markdown processing, large DOM), making it easier for different components to update at different times.

On iOS Safari specifically, viewport changes are influenced by dynamic browser UI (address/tab bars). The viewport size can change as UI expands/contracts; web.dev documents that dynamic toolbars influence viewport sizing on mobile browsers. citeturn1search2 Resizing of the (visual) viewport is a concept exposed by `VisualViewport.resize`. citeturn1search0  

The practical effect: with many listeners and frequent viewport changes, `MessageBubble`’s `isMobile` and `MessageIcons`’ `isMobile` are more likely to transiently disagree, allowing both:
- Mobile entry (ellipsis → dialog) to be available, and
- Desktop entry (action row ReadAloud) to still be present and clickable.

### Why iPhone “one tap” can lead to multiple event sequences

Touch interactions can produce emulated events in browsers: MDN notes that browsers typically dispatch emulated mouse and click events for single-touch interactions, and suggests Pointer Events to avoid the mouse+touch duality. citeturn2search4  

When both desktop and mobile controls are present in the rendered UI tree, that dual event sequencing increases the chance that both handlers are invoked back-to-back (especially if UI state changes quickly during the interaction, such as opening/closing the dialog).

### Why the TTS layer may not block the second invocation

Even if the two handlers fire very close together, `requestTTS` relies on `isGeneratingRef.current` as a guard. That ref is kept in sync via a `useEffect` watching `isGenerating`. fileciteturn40file0L94-L100 The guard check occurs inside `requestTTS`. fileciteturn40file0L270-L277  

Because ref synchronization is not done *synchronously at the top of `requestTTS`*, two invocations that occur within the same event loop turn can both observe the guard as `false` and proceed, sending multiple websocket requests. fileciteturn40file0L263-L295  

This is consistent with a symptom described as “both desktop and mobile listeners fire,” resulting in duplicate audio generation/play attempts.

## Surgical code patch and rationale

### Design goals

- Prevent desktop and mobile Read Aloud handlers from both being reachable on iOS.
- Avoid impacting desktop behavior/UI.
- Reduce per-message global listener overhead by eliminating redundant `useIsMobile()` calls inside `MessageIcons`.
- Keep changes minimal and localized to the three message-bubble files.

### Patch

```diff
diff --git a/apps/web/src/ui/chat/message-bubble/index.tsx b/apps/web/src/ui/chat/message-bubble/index.tsx
index dae278fe..XXXXXXXX 100644
--- a/apps/web/src/ui/chat/message-bubble/index.tsx
+++ b/apps/web/src/ui/chat/message-bubble/index.tsx
@@ -686,10 +686,11 @@ export function MessageBubble({
           )}
           <MessageIcons
+            isMobile={isMobile}
             isStreaming={isStreaming}
             message={message}
             user={user}
           />
         </div>

diff --git a/apps/web/src/ui/chat/message-bubble/message-icons.tsx b/apps/web/src/ui/chat/message-bubble/message-icons.tsx
index 10e58627..YYYYYYYY 100644
--- a/apps/web/src/ui/chat/message-bubble/message-icons.tsx
+++ b/apps/web/src/ui/chat/message-bubble/message-icons.tsx
@@ -4,7 +4,6 @@ import type { User } from "@/utils/auth-client";
 import { useCallback, useEffect, useMemo, useRef } from "react";
 import { useCookiesCtx } from "@/context/cookie-context";
 import { useTTSContext } from "@/context/tts-context";
-import { useIsMobile } from "@/hooks/use-is-mobile";
 import { useReaction } from "@/hooks/use-reaction";
 import { formatTime, getFirstName } from "@/lib/helpers";
 import { getModelDisplayName } from "@/lib/models";
@@ -29,12 +28,14 @@ export function MessageIcons({
   user,
   message,
-  isStreaming
+  isStreaming,
+  isMobile
 }: {
+  isMobile: boolean;
   isStreaming: boolean;
   message: MessageSingleton<true>;
   user?: User;
 }) {
-  const isMobile = useIsMobile();
   const { resolvedTheme } = useTheme();
   const { handleReaction, isPending, reactionState } = useReaction(message);
   const tts = useTTSContext();
@@ -49,8 +50,9 @@ export function MessageIcons({
   const primerRef = useRef<HTMLAudioElement | null>(null);
   const hasPlayedPrimer = useRef(false);

   useEffect(() => {
-    if (primerRef.current) return;
+    if (isMobile) return;
+    if (primerRef.current) return;
     const el = new Audio(primerAudio);
     el.volume = 0.1;
     el.preload = "auto";
@@ -64,7 +66,7 @@ export function MessageIcons({
       el.pause();
       primerRef.current = null;
     };
-  }, []);
+  }, [isMobile]);

   const handleReadAloud = useCallback(() => {
+    if (isMobile) return;
     if (isTTSActive) {
       tts.stop();
     } else {
@@ -74,7 +76,7 @@ export function MessageIcons({
       }
       tts.requestTTS(message.id, message.conversationId);
     }
-  }, [isTTSActive, tts, message.id, message.conversationId]);
+  }, [isMobile, isTTSActive, tts, message.id, message.conversationId]);

@@ -139,9 +141,9 @@ export function MessageIcons({
       {message.senderType === "AI" ? (
         <>
-          <div
-            className={cn(isMobile ? "hidden" : "flex", "items-center gap-2")}>
+          {!isMobile && (
+          <div className="flex items-center gap-2">
             <AnimatedCopyButton
               textToCopy={message.content}
               className={cn(
@@ -222,7 +224,8 @@ export function MessageIcons({
             </Button>
             <Button
               variant="ghost"
@@ -240,7 +243,8 @@ export function MessageIcons({
               <RetryIcon className="size-3" />
             </Button>
-          </div>
+          </div>
+          )}
           <div className="flex items-center gap-2">
             <span>{formatTime(message.createdAt, locale, tz)}</span>
             {message.model && message.provider && (
@@ -267,8 +271,8 @@ export function MessageIcons({
             <span>•</span>
             <span className="font-medium">{getFirstName(user?.name)}</span>
           </div>
-          <div
-            className={cn("items-center gap-2", isMobile ? "hidden" : "flex")}>
+          {!isMobile && (
+          <div className="flex items-center gap-2">
             <AnimatedCopyButton
               textToCopy={message.content}
               className={actionButtonVariants.default}
@@ -285,7 +289,8 @@ export function MessageIcons({
             <Button
               variant="ghost"
               size="icon"
@@ -295,7 +300,8 @@ export function MessageIcons({
               <EditIcon className="size-3" />
             </Button>
           </div>
+          )}
         </>
       )}
     </div>

diff --git a/apps/web/src/ui/chat/message-bubble/actions-dialog.tsx b/apps/web/src/ui/chat/message-bubble/actions-dialog.tsx
index 3c0ee463..ZZZZZZZZ 100644
--- a/apps/web/src/ui/chat/message-bubble/actions-dialog.tsx
+++ b/apps/web/src/ui/chat/message-bubble/actions-dialog.tsx
@@
 // No functional changes required for the fix; mobile dialog remains the single mobile TTS entry point.
```

### Rationale for the fix

- `MessageBubble` already computes `isMobile`. Passing that into `MessageIcons` removes the redundant second `useIsMobile()` per message (and therefore removes redundant global `resize/orientationchange` listeners for every message icon row). fileciteturn43file0L79-L90 fileciteturn39file0L31-L41  
- On mobile, the desktop action row is currently *hidden* via CSS but still exists as an interactive surface if `isMobile` state becomes inconsistent. fileciteturn37file0L140-L143  
  The patch changes that to **not render at all** when `isMobile === true`, eliminating the possibility that a desktop Read Aloud click handler can be reached on iOS through any sequencing quirk.
- On mobile, `MessageIcons` no longer prefetches the primer audio (since the mobile UI uses `MessageActionsDialog` for TTS). This reduces background audio element churn in long conversations while preserving the mobile dialog’s primer behavior. fileciteturn37file0L49-L67 fileciteturn36file0L59-L75  
- Desktop behavior is unchanged: when `isMobile` is false, the desktop action row renders with the same onClick handler to start/stop TTS. fileciteturn37file0L188-L199  

## Current vs proposed behavior comparison

| Scenario | Current behavior | Proposed behavior |
|---|---|---|
| iPhone Safari, short conversation | Mobile ellipsis opens dialog; desktop action row is intended to be hidden, but `MessageIcons` still runs its own mobile detection and preloads primer audio per message. fileciteturn43file0L563-L577 fileciteturn37file0L40-L43 fileciteturn37file0L49-L67 | Mobile ellipsis opens dialog; `MessageIcons` receives `isMobile=true`, does not render action row and does not prefetch primer. |
| iPhone Safari, long conversation | Increased chance of inconsistent per-component `isMobile` state and multiple global listeners from many hook instances; can allow both mobile and desktop TTS triggers to be reachable. fileciteturn39file0L31-L41 citeturn2search4turn1search2 | Only the mobile dialog is a TTS entry point on iOS; desktop handler surface is not rendered on mobile, preventing dual invocation. |
| Desktop Chrome/Safari | Desktop action row visible; click plays primer and requests/plays TTS. fileciteturn37file0L49-L78 | Same UI and behavior; `isMobile=false` is passed from `MessageBubble`, and action row renders normally. |
| iOS Safari “silent mode” / mute switch | TTS provider attempts to set AudioSession type `"playback"` when supported. fileciteturn41file0L22-L33 citeturn0search1turn0search0 | Unchanged; fix is UI-level only. |

## Step-by-step testing instructions on iPhone Safari

These steps assume iOS version and app version are unspecified; they should be repeated across at least two iOS versions if you have device access.

### Preparation

1. Deploy the patch (or run locally via HTTPS on a reachable dev host; Safari’s media policies can differ between `http` and `https` contexts depending on setup).  
2. In iPhone Safari, ensure you are testing in normal mode first (then optionally repeat in Private mode).  
3. If you have previously used “Request Desktop Website” for the domain, disable it for a clean baseline (Settings → Safari → Request Desktop Website, or per-site “aA” menu).

### Functional verification

1. Open a **long conversation** (the reported problematic condition) and scroll through several screens to exercise dynamic toolbar behavior. Mobile viewport sizing is affected by dynamic browser UI. citeturn1search2  
2. Pick an AI message:
   - Confirm that the **desktop action row is not present** (copy/reaction/read-aloud icons should not show in-message on mobile).  
   - Confirm the **ellipsis button** appears on the message bubble. fileciteturn43file0L563-L577  
3. Tap the ellipsis to open the actions dialog.
4. Tap **Read Aloud** once.
   - Expected: exactly one cassette click primer (if it hasn’t been played for that dialog instance yet) and a single TTS playback start. fileciteturn36file0L59-L91  
5. While audio is playing, tap Read Aloud again (stop behavior):
   - Expected: the TTS stops (calls `stop()` via the “is active” path). fileciteturn36file0L77-L91  
6. Repeat steps 2–5 for at least three messages with different positions in the chat (top, middle, very bottom), verifying no double-trigger artifacts (e.g., two primers, double playback restarts, repeated websocket actions).

### Regression checks

1. Rotate the phone (portrait ↔ landscape) and repeat the Read Aloud test:
   - This ensures `orientationchange` and viewport changes do not reintroduce the mismatch. fileciteturn39file0L31-L41  
2. Enable silent mode (hardware mute switch), repeat playback:
   - Expected: if `navigator.audioSession` is supported, the code sets type `"playback"`. Your actual audible behavior depends on platform support and OS settings, but the intent is explicit. fileciteturn41file0L22-L33 citeturn0search0turn0search1turn0search2  

### Desktop non-regression

On a desktop browser (Chrome + Safari if possible):

1. Open the same conversation.
2. Confirm the action row renders under AI messages and Read Aloud works as before (primer + TTS). fileciteturn37file0L49-L78  
3. Confirm that mobile ellipsis button does not appear (unless you intentionally force mobile viewport behavior).

### Optional instrumentation (high signal if you can remote-debug)

If you can attach Safari Web Inspector (iPhone ↔ Mac), add temporary logging in both handlers before removal to confirm only one path fires per tap. This is especially useful because touch devices may involve emulated click sequences. citeturn2search4  

