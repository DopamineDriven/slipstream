• The v0 prototype is useful, but the transferable part is the consumer anchoring pattern, not the
  hook verbatim. One important difference: v0 renders directly from SWR’s merged conversation; web-
  next hydrates an external store in an effect, so anchor restoration must wait for the store-backed
  messages to actually grow.

• Edited architectural-decisions/2026-05-31/codex-react-sweet-summer-child-follow-up.md (+164 -1)
    167
    168 +## Prototype Cross-check
    169 +
    170 +Reference prototype:
    171 +
    172 +```txt
    173 +/home/dopaminedriven/personal/infinite-scroll-chat
    174 +```
    175 +
    176 +Relevant files:
    177 +
    178 +- `hooks/use-conversation-messages.ts`
    179 +- `components/chat-container.tsx`
    180 +- `lib/mock-messages.ts`
    181 +
    182 +The prototype validates the overall direction:
    183 +
    184 +- one unified page shape: `{ convo, nextCursor, hasMore }`
    185 +- SWR Infinite owns cold-history pages
    186 +- `loadMore` increments SWR size
    187 +- `hasMore` comes from the last loaded page
    188 +- `isLoadingMore` is exposed directly
    189 +- a top sentinel triggers older-page fetches
    190 +- scroll anchoring captures previous `scrollHeight` before `loadMore`
    191 +- after older rows render, `scrollTop` is adjusted by the new `scrollHeight` delta
    192 +
    193 +### What Transfers Directly
    194 +
    195 +The `ChatContainer` anchoring model is the useful part:
    196 +
    197 +```ts
    198 +prevScrollHeightRef.current = root.scrollHeight;
    199 +isPrependingRef.current = true;
    200 +void loadMore();
    201 +```
    202 +
    203 +Then after the older messages render:
    204 +
    205 +```ts
    206 +const delta = el.scrollHeight - prevScrollHeightRef.current;
    207 +if (delta > 0) {
    208 +  el.scrollTop += delta;
    209 +}
    210 +isPrependingRef.current = false;
    211 +```
    212 +
    213 +The top-sentinel approach is also valid. The prototype uses:
    214 +
    215 +```ts
    216 +rootMargin: "600px 0px 0px 0px"
    217 +```
    218 +
    219 +That starts fetching before the user reaches the true top, which is a better experience than
         waiting until `scrollTop === 0`.
    220 +
    221 +### What Should Not Be Copied Blindly
    222 +
    223 +The prototype renders directly from SWR:
    224 +
    225 +```ts
    226 +const messages = conversation?.messages ?? [];
    227 +```
    228 +
    229 +`web-next` does not. In `web-next`, SWR is a write-only loader into the external `ChatStore`;
          `ChatFeed` renders from:
    230 +
    231 +```ts
    232 +const committed = useChatCommitted(store);
    233 +```
    234 +
    235 +That changes the anchoring timing. In the prototype, `isLoadingMore` flips false in the same
         render where `messages` already contains the prepended rows. In `web-next`, SWR data can arri
         ve first, then `useHydrateChatStore` hydrates the store in an effect, then the store notifies
          `useChatCommitted`, then `ChatFeed` receives the larger message list.
    236 +
    237 +So this prototype effect is too eager for `web-next` if copied exactly:
    238 +
    239 +```ts
    240 +if (!isPrependingRef.current) return;
    241 +if (isLoadingMore) return;
    242 +const delta = el.scrollHeight - prevScrollHeightRef.current;
    243 +el.scrollTop += delta;
    244 +isPrependingRef.current = false;
    245 +```
    246 +
    247 +In `web-next`, that can run after SWR finishes but before the store-backed `messages` list ha
         s grown, producing `delta = 0` and clearing the pending anchor too early.
    248 +
    249 +The `web-next` version should restore only after the feed's actual rendered message list grow
         s beyond the count captured before `loadMore`:
    250 +
    251 +```ts
    252 +const anchor = prependAnchorRef.current;
    253 +if (!anchor || !scrollRef.current) return;
    254 +if (messages.length <= anchor.messageCount) return;
    255 +
    256 +requestAnimationFrame(() => {
    257 +  const container = scrollRef.current;
    258 +  if (!container) return;
    259 +  container.scrollTop =
    260 +    anchor.scrollTop + (container.scrollHeight - anchor.scrollHeight);
    261 +  prependAnchorRef.current = null;
    262 +});
    263 +```
    264 +
    265 +This is the main adaptation required by the external-store architecture.
    266 +
    267 +### Ordering Difference
    268 +
    269 +The prototype mock API returns each page's `convo.messages` in ascending display order. Its m
         erge walks pages from oldest loaded page to newest loaded page:
    270 +
    271 +```ts
    272 +for (let i = data.length - 1; i >= 0; i--) {
    273 +  messages.push(...data[i].convo.messages);
    274 +}
    275 +```
    276 +
    277 +`web-next` currently returns each page from Prisma in `ordinal desc` order. The existing `web
         -next` hook flattens loaded pages and reverses the whole result:
    278 +
    279 +```ts
    280 +const messages = (data ?? [])
    281 +  .flatMap(page => page.convo.messages)
    282 +  .reverse();
    283 +```
    284 +
    285 +Given the current API shape, that is correct. Do not copy the prototype page merge unless the
          API is changed to reverse each page before returning it.
    286 +
    287 +The store also sorts by `ordinal` during ingestion, so display order is protected even if SWR
         's merged conversation order is not perfect. Still, keeping the loader's merge behavior consi
         stent with the route contract reduces debugging noise.
    288 +
    289 +### Hook Shape to Borrow
    290 +
    291 +`web-next` should borrow the prototype's explicit return of `isLoadingMore` and `hasMore`.
    292 +
    293 +Current `web-next` already computes `isLoadingMore` inside `use-conversation-messages.ts`, bu
         t it does not return it. That should change.
    294 +
    295 +Recommended bridge shape:
    296 +
    297 +```ts
    298 +const {
    299 +  conversation,
    300 +  isLoading,
    301 +  isLoadingMore,
    302 +  isValidating,
    303 +  hasMore,
    304 +  loadMore,
    305 +  error
    306 +} = useConversationMessages(args);
    307 +```
    308 +
    309 +Then forward these through `useHydrateChatStore`. The feed should receive UI-oriented names:
    310 +
    311 +```tsx
    312 +<ChatFeed
    313 +  hasOlderMessages={hasMore}
    314 +  isLoadingOlderMessages={isLoadingMore}
    315 +  loadOlderMessages={loadMore}
    316 +/>
    317 +```
    318 +
    319 +### Sentinel vs Scroll-threshold
    320 +
    321 +After seeing the prototype, a top sentinel is probably the better first implementation than a
          manual `scrollTop <= threshold` check.
    322 +
    323 +Reasons:
    324 +
    325 +- the prototype already validates the behavior
    326 +- prefetch via `rootMargin` is smoother
    327 +- it avoids another debounced scroll-state path
    328 +- it can live entirely inside `ChatFeed`, attached to the same `scrollRef`
    329 +
    330 +The sentinel must still use the `messageCount` anchor guard described above because of the SW
         R-to-store bridge.
    331 +
    332  ### Step 1: Expose pagination state from the bridge
        ⋮
    476  `ChatInput` contains `console.log` / `console.error` calls from existing code. That violates
         the repo's `AGENTS.md` logger rule, but it is separate from the 25-message pagination issue a
         nd should not be mixed into this repair unless cleanup is explicitly scoped.
    313 -

──────────────────────────────────────────────────────────────────────────────────────────────────────

• I reviewed the v0 prototype and updated the follow-up note here:

  architectural-decisions/2026-05-31/codex-react-sweet-summer-child-follow-up.md

  Key takeaway: the prototype validates the sentinel + scrollHeight delta approach, but we should not
  copy it verbatim. v0 renders directly from SWR, while web-next renders from the external store after
  SWR hydrates it. So the anchor restore in web-next needs to wait until the store-backed
  messages.length actually increases, or it can clear too early with delta = 0.

  I also noted the ordering difference: v0 returns each page ASC, while web-next currently returns
  each page ordinal desc, so the current flatMap(...).reverse() behavior is correct unless we change
  the API page order.
