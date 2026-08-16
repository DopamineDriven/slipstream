# React Native v1 preliminary findings

- **Date:** 2026-08-15
- **Status:** Preliminary estimate, not an implementation plan or commitment
- **Basis:** Current `apps/web`, `packages/ui`, shared types, chat state, WebSocket protocol, and server resolvers
- **Estimate model:** One experienced TypeScript/React engineer working full-time, already familiar with this repository

## Executive finding

Start the React Native work now. Apple organization enrollment, the D-U-N-S process, and App Store Connect are not prerequisites for scaffolding the app, running it in the iOS simulator, validating the architecture, or building almost all of the prototype. They become critical for organization signing, TestFlight distribution, and App Store submission. Expo likewise separates local development from store distribution in its [development-build documentation](https://docs.expo.dev/develop/development-builds/introduction/).

For a deliberately text-first, internal v1 prototype, the realistic planning number is:

> **15–22 focused engineering days, or roughly 3–5 calendar weeks for one full-time engineer. Book four calendar weeks and preserve a fifth as contingency.**

That estimate is for a real vertical slice: sign in, see conversations, open or start one, select a model, send text, and receive a streamed answer in a native iOS interface. It is not an estimate for porting every current web feature.

| Outcome | Engineering estimate | Likely solo calendar window |
| --- | ---: | ---: |
| Walking skeleton / internal demo | 8–12 days | 2–3 weeks |
| Scoped v1 prototype defined below | **15–22 days** | **3–5 weeks** |
| Security-hardened TestFlight beta | 25–40 days | 5–8 weeks, plus external enrollment/review time |
| Near-parity with the current web client | — | 10–16+ weeks |

The codebase is in a better starting position than a greenfield mobile client because its typed events, model metadata, server resolvers, and a substantial portion of its chat state are reusable. The estimate is not shorter because the current UI package is a web component system, not a cross-platform component system, and mobile authentication must be proven early.

## What “v1 prototype” means here

### Included

- An Expo-based iOS app living in the existing monorepo.
- Native navigation, safe-area handling, keyboard handling, and a small branded theme.
- At least one existing OAuth provider working end to end through Better Auth, with the session persisted in native secure storage.
- Conversation list, new conversation, and opening an existing conversation.
- Recent conversation hydration; basic older-history loading if the existing event path behaves cleanly.
- Existing provider/model metadata and a usable model picker.
- A text-only composer.
- Optimistic user messages, streamed assistant text, streamed thinking state, completion, and error handling.
- Basic Markdown and fenced-code rendering. Full web rendering parity is not included.
- Foreground/background connection handling, reconnect behavior, and visible retry state.
- Simulator validation, at least one physical-device smoke test when signing access is available, and focused tests around extracted state and transport behavior.

### Explicitly excluded

- File, photo, camera, and document attachments.
- Image-generation controls, progressive image presentation, gallery behavior, and downloads.
- Text-to-speech streaming and native audio caching.
- API-key CRUD in the mobile app; v1 assumes providers are configured through the web app.
- Reactions, quote-selection workflows, edit/regenerate parity, sharing, and the full settings surface.
- Exact Shiki, KaTeX, syntax-highlighting, and rich-Markdown parity.
- Push notifications, offline sending, or background generation completion.
- Android-specific validation.
- TestFlight/App Store submission work and public-production security certification.

The prototype is “up and running” when a fresh development build can authenticate, list conversations, open or create a chat, select a configured model, send a prompt, display the streamed answer, survive a normal background/foreground cycle, and surface a recoverable network failure.

## What the repository says about portability

The inspected surface is approximately 24.7k lines of TypeScript/TSX under `apps/web/src` and 8.2k under `packages/ui/src`. The line counts are directional rather than a productivity formula; their value is in showing where the implementation lives.

| Existing layer | Current evidence | React Native disposition |
| --- | --- | --- |
| Shared protocol/types | Roughly 7.3k lines in `packages/types`; canonical chat events, models, and singleton types | **Reuse**, after an early Metro/Hermes import smoke test and preferably through mobile-safe explicit subpath exports |
| Chat state | [`ChatStore`](../../../apps/web/src/state/chat/store.ts#L45), message workup, draft adapter, and state types are mostly React- and DOM-independent | **Extract/reuse**; approximately 900–1,100 useful lines are plausible candidates |
| Store registry | Routing and LRU concepts are portable, but rekeying calls [`window.history.replaceState`](../../../apps/web/src/state/chat/store-registry.ts#L200) | **Adapt** behind an injected navigation/rekey interface |
| WebSocket client | Browser implementation already provides queueing, reconnect, typed dispatch, and streaming semantics; the CLI proves a second transport can speak the same protocol | **Adapt**, adding native app-lifecycle behavior and authenticated connection ownership |
| Conversation data | Typed `conversation_list` and `hydrate_conversation` events already exist in [`events.ts`](../../../packages/types/src/events.ts#L89), with server resolvers behind them | **Reuse**; this avoids reproducing the entire Next/SWR data layer for v1 |
| `packages/ui` | About 52 base/composite component files plus roughly 97 icon files; uses DOM tags, `className`, CSS, Tailwind, Base UI/Radix-style libraries, React DOM, and browser globals | **Rewrite presentation natively**; do not import it directly into the mobile app |
| Markdown, files, and audio | Current implementations depend on browser rendering, `File`/blob URLs, XHR-style upload behavior, Web Audio/HTML audio, and DOM selection/scrolling | **Replace with native implementations**, and defer the expensive portions from v1 |

### The important `packages/ui` conclusion

`packages/ui` is shared within the web ecosystem, but it is not platform-neutral. Its package surface includes Next/React DOM/Tailwind and web-only component dependencies, and its main source entry imports [`globals.css`](../../../packages/ui/src/index.ts). Its components render DOM primitives such as `div`, `button`, and `svg`; hooks use APIs such as `window`, `document`, `navigator`, `localStorage`, `ResizeObserver`, and `HTMLElement`.

Consequently, direct component reuse in React Native is effectively zero. Trying to make this package conditional on platform would likely cost more than creating a small native UI layer and would make both platforms harder to reason about.

What can be reused from it is the design intent:

- color, spacing, radius, typography, and motion choices translated into plain TypeScript native tokens;
- labels and interaction semantics;
- icon artwork/path data, rewritten using a native SVG implementation;
- genuinely pure numeric or timing utilities after they are separated from browser-specific modules.

For the prototype, native components should remain local to the mobile app. If a stable reusable native system emerges later, promote it deliberately to a separate package such as `packages/ui-native`; do not force premature parity with the web package.

### The favorable backend finding

The server already exposes typed conversation-list and conversation-hydration WebSocket flows. That means v1 can use the same event channel for the initial chat index and history instead of porting the current Next.js routing and SWR assumptions. The non-browser CLI also handles those event families, which is useful evidence that the backend protocol is not intrinsically tied to the DOM.

The existing chat store already covers several expensive behavioral details: optimistic messages, streamed text/thinking blocks, new-chat-to-real-ID rekeying, message workup, provider/model context, and stable-store behavior. These should become a small shared chat-core package with explicit subpath exports, not be recopied into the native app and allowed to drift.

## Recommended technical shape

1. Add an Expo app under `apps/mobile`. The workspace layout is already compatible with an `apps/*` package. Expo documents first-class monorepo support for pnpm workspaces and automatic Metro monorepo configuration, while warning that duplicate React/React Native versions can cause runtime failures ([Expo monorepo guide](https://docs.expo.dev/guides/monorepos/)).
2. Use an Expo development build, not Expo Go as the architectural target. Auth, secure storage, native files/media, and later release features are likely to require native modules.
3. Prove a thin vertical slice before building screens: boot iOS, import the shared event/model types through Metro/Hermes, complete one OAuth/deep-link/session cycle, establish one authenticated WebSocket, and stream one text turn.
4. Extract reusable logic into a focused `packages/chat-core` only after or alongside that proof. Export concrete modules through explicit package subpaths; do not create a barrel export.
5. Give chat core an injected transport and an injected navigation/rekey adapter. The web app can supply browser implementations and the mobile app can supply React Navigation/Expo Router and native WebSocket implementations.
6. Build mobile UI from React Native primitives. Share tokens and behavior, not DOM components.
7. Add an `AppState`-aware connection wrapper so backgrounding, foregrounding, stale sockets, and interrupted streams have explicit state transitions. React Native exposes [`AppState`](https://reactnative.dev/docs/appstate) and a global [`WebSocket`](https://reactnative.dev/docs/global-WebSocket), but their presence does not by itself solve lifecycle recovery.
8. Keep attachment, image, and audio subsystems outside the first vertical slice. Each has a separate native transport and lifecycle problem.

## Authentication and security gate

This is the highest-variance area and should be tested in the first 2–3 days.

The web app currently uses Better Auth with social providers, request-origin trust, Next cookie integration, and browser-relative API behavior in [`auth.ts`](../../../apps/web/src/utils/auth.ts#L16). Better Auth has an official Expo integration using a server plugin, Expo client plugin, secure storage, an application URL scheme, trusted origins, and deep-link callbacks ([Better Auth Expo integration](https://better-auth.com/docs/integrations/expo)). The mobile client and server configuration still need to adopt and validate that path; the current browser session flow should not be assumed to transfer automatically.

There is also a release-critical WebSocket issue to resolve before a public/TestFlight beta. The current handshake reads a caller-supplied user ID in [`authenticateConnection`](../../../apps/ws-server/src/ws-server/index.ts#L420), then asks whether that user has an unexpired database session through [`getAndValidateUserSessionById`](../../../apps/ws-server/src/prisma/user-meta.ts#L139). It does not demonstrate that the connecting client possesses that session. This is usable only as an internal-prototype shortcut. A distributable build needs a token-, cookie-, or one-time-ticket-based handshake that proves connection ownership and binds it to the resolved user.

The 15–22 day estimate includes proving the native sign-in/session flow and defining the authenticated WebSocket contract. It does **not** assume that a production security review, migration strategy, and all release hardening fit inside the prototype. Those belong in the TestFlight-beta range.

## Estimated work breakdown

| Workstream | Focused days | Concrete exit condition |
| --- | ---: | --- |
| Foundation and risk spike | 2–3 | Expo app boots in iOS; shared types bundle; one OAuth callback/session works; one WS text exchange completes |
| Shared chat core and native transport | 3–4 | Store/draft/message behavior is reused without browser dependencies; typed dispatch, queue, reconnect, app lifecycle, and rekey adapters work |
| Authentication, navigation, and conversations | 3–4 | Sign-in/out, secure session persistence, conversation index, new/open flow, and recent history work |
| Native chat UI | 4–6 | Virtualized feed, composer, streaming/thinking state, model picker, basic Markdown/code, keyboard, safe area, and scroll behavior work |
| Hardening and verification | 3–5 | Errors/retry/background recovery, long-stream behavior, focused tests, accessibility pass, and simulator/device smoke checks complete |
| **Total** | **15–22** | **Scoped internal v1 prototype** |

These are solo-engineer sequential estimates. Separate people can overlap some UI and transport work, but authentication and the initial vertical slice remain gating dependencies.

### A practical four-week schedule

- **Week 1:** Scaffold, Metro/Hermes compatibility, development build, native auth spike, WebSocket proof, first crude streamed turn.
- **Week 2:** Extract/adapt chat core, navigation, conversation list, create/open, and history hydration.
- **Week 3:** Native conversation UI, model picker, streaming/thinking rendering, Markdown/code baseline, keyboard and scroll behavior.
- **Week 4:** Reconnect/background behavior, error UX, testing, accessibility, performance, and a device-quality demo build.
- **Week 5 contingency:** Absorb auth/protocol surprises, native build configuration issues, or polish required by real-device testing.

If the initial spike is clean and the scope stays text-only, a usable build near the end of week 3 is plausible. Four weeks is the more responsible commitment because native auth and streaming-list behavior are not yet proven in this repository.

## Cost of adding deferred features

These ranges are directional and can overlap; they should not all be mechanically summed.

| Additional capability | Likely incremental effort |
| --- | ---: |
| Photo/camera/document attachments with upload progress | +5–8 days |
| Image-generation controls, progressive results, gallery/download/share | +3–6 days |
| Native TTS streaming, playback, interruption handling, and cache | +4–7 days |
| API-key CRUD and mobile-safe settings/server contract | +4–6 days |
| Rich Markdown parity: GFM, math, syntax highlighting, copy actions | +3–6 days |
| Reactions, quote/share workflows, settings/theme polish | +3–5 days |
| Production WebSocket authentication and related API contract work | +3–6 days |
| Android validation after an iOS-first build | +3–6 days |
| Push notifications/background-completion behavior | +4–8 days plus Apple capability setup |

## Assumptions behind the estimate

- One full-time engineer at roughly 35–40 productive hours per week, familiar with this monorepo and its event model.
- A Mac with a functioning current Xcode/iOS Simulator toolchain.
- The existing backend remains available and its chat protocol does not undergo a simultaneous redesign.
- At least one test account has provider credentials already configured through the web app.
- iOS is first; Android and store submission are separate milestones.
- Product design follows the current web interaction model with mobile simplification rather than a new design exercise.
- Necessary native dependencies can be approved when implementation begins; none should be installed merely to validate this report.
- Full attachments, images, TTS, API-key management, and rich-rendering parity remain outside v1.
- Apple/D-U-N-S processing runs in parallel and does not gate simulator development.

If the work is part-time, scale calendar time by actual availability rather than compressing the engineering-day total. At 20 hours per week, the same prototype is closer to 6–9 calendar weeks.

## Confidence and estimate-change triggers

**Confidence: medium, approximately ±30%.** The backend event surface and chat-store reuse lower uncertainty; mobile auth, socket ownership, native rendering, and lifecycle behavior raise it.

Re-estimate immediately after the risk spike if any of these occurs:

- `@slipstream/types` cannot be consumed by Metro/Hermes without restructuring Node-targeted package boundaries;
- OAuth succeeds in the browser but cannot produce a durable native session usable by both API and WebSocket paths;
- the authenticated socket design requires a broader server/session redesign;
- long streaming conversations cause unacceptable native list churn or Markdown-rendering cost;
- “v1” expands to include even two of attachments, images, TTS, API-key management, Android, or full rich-rendering parity.

A failed auth or shared-types spike should add **3–5 engineering days** to the prototype forecast before the rest of the UI is scheduled. That is why the spike is first rather than a late integration task.

## Recommendation

Use **four calendar weeks** as the working target for a credible, text-first internal prototype and treat **week five as contingency**. Begin immediately with the 2–3 day vertical-slice spike. Keep the native presentation separate from `packages/ui`, extract the genuinely platform-neutral chat behavior, and make authenticated WebSocket ownership the explicit gate between an internal demo and a distributable beta.

The Apple organization account can mature in parallel. By the time it is ready, the project should ideally already have passed its highest-risk technical checks and be well into the native conversation experience rather than just beginning development.
