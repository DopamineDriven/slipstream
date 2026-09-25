# Inline images in provider context history — follow-up to `example.md`

Date: 2026-09-24. Read-only review of `stream-workup.ts` L46-69 (the new
`IMAGE_GEN` branch in `messageText`), the `ai_chat_request` loaders in
`prisma/chat-request.ts` that produce the `msgs` it reads, and the persist
layer that writes the rows it is looking for. No code changed.

---

## 0. Short answer

**The branch is the right shape, and it is dead today.** Nothing that feeds
`formatxAIMsgHistory` populates `block.attachments`, and the message-level
`attachments` filter in those same loaders excludes every inline row. So
right now an inline image is absent from Grok's history *and* from every
other provider's, and the branch cannot fire.

**You do not need `attachments` via `messageBlocks` to fix that.** The
inline rows are already on `message.attachments`: persist creates them as a
nested `create` on the AI message (`chat-response.ts` L289-295), then stamps
`messageBlockId` on each (L487-495). The join key lives on the row. One
extra arm in the existing `where` and a `messageBlockId` comparison inside
`messageText` gets the image into the history at its ordinal, with the
prompt as caption, and:

- no nested include, no second copy of each row in the payload,
- no second bigint mapping per loader,
- `messageText(msg)` keeps its signature (`msg.attachments` is in hand),
- the same resolution path the client uses (§10.11 d joins by
  `messageBlockId` from the message's attachments),
- and every *other* provider's formatter starts seeing the image immediately
  through the assistant-branch attachment loop it already has, with zero
  edits.

The one cost: that same assistant-branch loop in `formatxAIMsgHistory` will
then also emit the inline image as a trailing `![name](url)`, so the url
appears twice in Grok's history unless one line is added to skip
block-owned rows. That is the same slot-ownership rule the spec already
imposes on the web bubble's trailing group (step 7, "double-render rule").
Details and the alternative in §3.

---

## 1. What actually reaches `messageText` today

`msgs` = `res.messages` from `handleAiChatRequest` (`resolver/chat.ts`
L166). For a Grok text turn the dispatcher lands in one of four loaders.
A create has no history, so only the two **update** loaders matter for
this question:

| loader | `messageBlocks` include | message-level `attachments.where` |
| --- | --- | --- |
| `handleAiChatReqUpdateWithAttachmentsSansAssetGen` L645 | `true` (L673) — **no `orderBy`** | job arm only (L674-685) |
| `handleAiChatReqUpdateSansAttachmentsSansAssetGen` L1129 | `{ orderBy: { ordinal: "asc" } }` (L1147) | job arm only (L1149-1160) |

The filter, verbatim (every site: L465, 568, 674, 781, 1038, 1149):

```ts
where: {
  OR: [
    { origin: { not: "GENERATED" } },
    { AND: [{ origin: "GENERATED" }, { imageGenOutput: { kind: "FINAL" } }] }
  ]
}
```

An inline row is `origin: "GENERATED"` (`base.ts` L136) and has **no**
`imageGenOutput` — it has `inlineImageGenOutput`. A to-one relation filter
does not match a null relation, so the row fails both arms and is dropped
before `includeGamma`'s new `inlineImageGenOutput: true` can matter.

So at the point `messageText(msg)` runs, for an AI message that carried an
inline image:

```
msg.messageBlocks[i]              // { type: "IMAGE_GEN", content: <prompt>, … }
msg.messageBlocks[i].attachments  // undefined  (never included)
msg.attachments                   // no inline rows (filtered out)
```

`block.attachments` is `undefined` → the `&&` short-circuits → nothing is
pushed. The `TEXT` blocks still join, so the history reads as text with a
hole where the image was.

This is also why nothing shows for other providers: their assistant-branch
loops (`openai/workup.ts`, `meta/workup.ts`, `sakana/workup.ts`, the
`memory.ts` files) read `msg.attachments` with `assetType === "IMAGE"`, and
the rows never arrive.

---

## 2. Two ways to get the row next to the block

### (A) Nested include on `messageBlocks` — what `example.md` prototypes

The prototype (`chat-request.ts` L1019-1037, the audio-gen
update-sans-attachments loader) has three problems as written:

**1. `where` is under `include`, not under `attachments`.** Prisma's
`MessageBlockInclude` is exactly `{ message?, attachments?, _count? }`
(`packages/db/src/generated/prisma/models/MessageBlock.ts` L798-802). It
compiles only because the args generic is *inferred* from the literal and
checked against the constraint by assignability, which ignores extra keys;
excess-property checking never fires on that path. Prisma's runtime arg
validator does not ignore it — an unknown key inside `include` throws a
`PrismaClientValidationError`. As written, a Gemini Lyria update turn
without attachments throws on the read.

Correct placement, if you keep this route:

```ts
messageBlocks: {
  orderBy: { ordinal: "asc" },
  include: {
    attachments: {
      where: { inlineImageGenOutput: { kind: "FINAL" } },   // see 2
      orderBy: { createdAt: "asc" },
      include: this.includeGamma.include
    }
  }
},
```

**2. The copied filter arm can never match a block-owned row.** By the
step 1 invariant, an attachment has a `messageBlockId` ⇔ its block is
`IMAGE_GEN` ⇔ the row is inline. Block-level rows therefore never have
`imageGenOutput`, so the job arm returns nothing even once the `where` is
placed correctly. The block-level filter is `inlineImageGenOutput: { kind:
"FINAL" }` alone — or no filter at all, since `messageText` already checks
`kind === "FINAL"` in code (and with OpenAI inline later, the partials are
siblings on the same block that the code filter skips anyway).

**3. Every row rides twice.** `example.md` says it itself: "we'd need to
access `AttachmentSingleton<true>[]` in full under both
`message.attachments` and `imageBlock.attachments`." That is the same row,
serialized twice per image per message, on every request, for a join that
`messageBlockId` already encodes on the row.

And the tax: each loader that feeds a formatter needs the nested include
**and** the nested `size`/`inlineImageGenOutput` mapping (the ~20 lines at
L1080-1099 of the prototype), copied per site. Today that is the two
update loaders in §1; the two with-image-gen update loaders join when the
Grok job entry (step 5) lands; and every other provider's `messageText`
would still need to be taught to read `block.attachments` — a `Pick`
widening plus a loop each — before any of them sees the image.

There is one genuine merit to (A): the existing message-level `where`
would keep excluding inline rows, so the assistant-branch trailing loop in
`formatxAIMsgHistory` never sees them and there is no double. But that is
the filter's blind spot doing the work, not a decision. The moment anyone
adds the inline arm to that filter for parity with the client-facing
producers (which all carry inline rows at message level), the double
appears anyway.

### (B) Join in code from `msg.attachments` — recommended

Two edits in the loaders, one in `messageText`, one optional line in
`formatxAIMsgHistory`.

**B1. The filter gains a third arm.** Same place as the job arm, every site
in §1 (six in this file):

```ts
attachments: {
  where: {
    OR: [
      { origin: { not: "GENERATED" } },
      { AND: [{ origin: "GENERATED" }, { imageGenOutput: { kind: "FINAL" } }] },
      { AND: [{ origin: "GENERATED" }, { inlineImageGenOutput: { kind: "FINAL" } }] }
    ]
  },
  orderBy: { createdAt: "asc" },
  include: this.includeGamma.include
}
```

Partials stay out of history exactly as job partials do. `includeGamma`
already selects `inlineImageGenOutput`, so the row arrives with its `kind`,
`generatingModel`, `seriesOrdinal`, and dims.

**B2. `messageBlocks` gets `orderBy` wherever it is bare `true`** (L464,
566, 673). Block order now carries the image's position; an unordered
to-many include is insertion-ordered by accident, not by contract. The
sans-attachments update loader already orders (L1147).

**B3. `messageText` joins by `messageBlockId`.** Signature unchanged;
`msg.attachments` is required on `MessageSingleton` and `messageBlockId` is
a scalar on every row:

```ts
protected messageText(msg: MessageSingleton<true>) {
  const textBlocks = Array.of<string>();

  if (msg.messageBlocks && msg.messageBlocks.length > 0) {
    for (const block of msg.messageBlocks) {
      if (block.type === "TEXT") {
        textBlocks.push(block.content);
      }
      if (block.type === "IMAGE_GEN") {
        for (const att of msg.attachments) {
          if (att.messageBlockId !== block.id) continue;
          if (att.inlineImageGenOutput?.kind === "FINAL" && att.cdnUrl) {
            textBlocks.push(
              `![${att.inlineImageGenOutput.provider.toLowerCase()}/${att.inlineImageGenOutput.generatingModel}](${att.cdnUrl})\n\n${block.content}`
            );
          }
        }
      }
    }
  }
  if (textBlocks.length > 0) {
    return textBlocks.join("\n");
  } else return msg.content;
}
```

Position preserved (the image lands between the TEXT blocks that flanked
it on the wire), FINAL only, the rewritten prompt as caption under the
image — the same reading the bubble will give it.

**B4. The one line, owner's call.** With B1 the assistant branch of
`formatxAIMsgHistory` (L212-260) also sees the inline row as
`assetType === "IMAGE"` and pushes `${modelIdentifier}\n![name](url)` into
`textParts` *before* the body. Grok's history would then read:

```
[grok/grok-4.7]
![1790010492109-abc…-0.webp](https://assets…/abc…-0.webp)     ← trailing loop

[grok/grok-4.7]

<TEXT block 0>
![grok/grok-imagine-image-2.0](https://assets…/abc…-0.webp)   ← messageText
<prompt>
<TEXT block 2>
```

Same url twice, which reads as two images. The fix is one line at the top
of that loop, and it is the server twin of the rule step 7 already gives
the bubble's trailing group ("skip any attachment with a `messageBlockId`,
or the image draws twice"):

```ts
for (const att of msg.attachments) {
  if (att.messageBlockId) continue;   // owned by an IMAGE_GEN block; messageText places it
  const { cdnUrl, mime: ogMime, compatStatus, assetType, compatCdnUrl, compatMime } = att;
  …
```

If you would rather not touch `formatxAIMsgHistory` at all, the honest
alternative is to leave the double in for now and accept that Grok sees
the url twice; the other providers' formatters, which have no positional
branch yet, are unaffected either way — for them the trailing form *is*
the representation until their `messageText` grows the block branch, at
which point the same one line goes in there.

### Why (B) over (A), in one table

| | (A) nested include | (B) join from `msg.attachments` |
| --- | --- | --- |
| loader edits | nested include + ~20-line nested mapping per site | one `where` arm per site (+ `orderBy` where missing) |
| payload | each inline row twice | each row once |
| `messageText` signature | unchanged | unchanged |
| `formatxAIMsgHistory` | untouched, by accident of the filter | one line, by rule |
| other providers | still blind until each reads `block.attachments` | see the image immediately via their existing trailing loops |
| resolution path | server via block, client via message (§10.11 d) — two | one: `messageBlockId` on the row, everywhere |
| singletons | `MessageBlockSingleton.attachments?` populated here, `undefined` in all four client producers | consistent with the client producers |

---

## 3. Notes on the branch as written (L54-63)

- **Provenance in the alt text.** `![[${msg.provider}/${msg.model}]]`
  yields `![[GROK/grok-4.7]]` — uppercase where `modelIdentifier` (L210)
  is lowercase, and it names the facilitator, which is already the
  message-level prefix on L264. The image's own provenance is on the row:
  `inlineImageGenOutput.provider` / `.generatingModel`
  (`grok-imagine-image-2.0`). Using those gives the model the fact it does
  not otherwise have.
- **FINAL-only is right.** Grok emits one FINAL per call. When OpenAI inline
  lands, its partials are sibling rows on the same block (`seriesOrdinal`
  0…n−1, FINAL = n); the filter picks the one.
- **`join("\n")` is fine for a model reader.** The entry is
  `![…](url)\n\n<prompt>`; the single `\n` joiner around it does not need
  to be a paragraph break for context purposes.
- **Grok reads a url, not pixels.** Consistent with every prior-turn image
  in this formatter: only the current user turn's images go as
  `input_image` (L174-184). Nobody should expect vision recall of its own
  image on the next turn; if that is ever wanted it is a separate decision
  (`input_image` for the last AI image, same gate as user images).
- **`ENCRYPTED_THINKING` / `THINKING` stay skipped**, including the image
  upload block whose content is `*Generating Image...*`. Correct.

---

## 4. Parity notes, not asks

- `convo-memory-service.ts` `getMessagesByOrdinalRange` (L550-560)
  includes attachments without `inlineImageGenOutput`, and HMEM indexing
  reads `msg.content` (`memory/workup.ts` L225), so an inline image never
  enters memory. Whether a fold should carry "an image of X was generated
  here" is a separate decision; nothing in (A) or (B) changes it.
- The other `messageText` implementations take
  `Pick<MessageSingleton<true>, "content" | "messageBlocks">`
  (`openai/workup.ts` L129, `meta/workup.ts` L72, `sakana/workup.ts` L49).
  Under (B), giving them the positional form is a `Pick` widening to add
  `"attachments"` plus the same loop — no loader work.
- `getCurrentMsgAttCounts(res)` and `handleAIChatRequestIndexing(msgs, …)`
  read the *user* message's attachments; B1 does not change what they see.

---

## 5. If (B): the checklist

1. `chat-request.ts` — third `OR` arm at L465, 568, 674, 781, 1038, 1149.
2. `chat-request.ts` — `orderBy: { ordinal: "asc" }` on `messageBlocks` at
   L464, 566, 673.
3. `chat-request.ts` — the audio-gen prototype at L1019-1037: either revert
   to `messageBlocks: { orderBy: { ordinal: "asc" } }` (and drop the nested
   mapping at L1080-1099) or move the `where` under `attachments` with the
   inline arm — as written it will throw at runtime.
4. `stream-workup.ts` `messageText` — the `messageBlockId` join (B3).
5. `stream-workup.ts` `formatxAIMsgHistory` L213 — the one-line skip (B4),
   your call.

---

## 6. Addendum — "just use the attachment → messageBlock relation" (Andrew, same day)

Yes. That is B3: the FK of that optional relation, `messageBlockId`, is a
scalar on every row `includeGamma` already returns, so the join needs no
include in either direction. `att.messageBlockId === block.id` inside
`messageText`, done.

Two things the relation does **not** change:

- **The `where` arm is still required.** The rows are hidden today because
  the optional relation is exactly what the current filter cannot see: an
  inline row is `GENERATED` with no `imageGenOutput`, so it matches neither
  arm. Either the kind arm from B1 (`inlineImageGenOutput: { kind: "FINAL"
  }`, which also keeps partials out) or a relation arm
  (`messageBlock: { is: { type: "IMAGE_GEN" } }`, equivalent to
  `messageBlockId: { not: null }` by the step 1 invariant, but it admits
  partials once OpenAI inline lands). The kind arm is the tighter one.
- **The trailing-loop double (B4) is still there**, since the rows sit at
  message level either way.

If the thought was to add `messageBlock: true` to `includeGamma`: one edit
instead of six, no bigint on `MessageBlock` so no extra mapping, and it is
ERD-legitimate — but `AttachmentSingleton` has no `messageBlock?` field
yet (`types.ts` L220-234; the ERD relation is there, the singleton line is
not). It buys nothing for the join that the scalar does not already give.
Where it would pay is the other providers' trailing loops, which could
then emit the caption (`att.messageBlock.content`) without reading
`messageBlocks` at all. Optional; not needed for Grok.

---

## 7. `cdnUrl?` on `MessageBlock` — take it (Andrew's proposal, same day)

State after Andrew's pass on `chat-request.ts`: every loader has the third
arm, every `messageBlocks` include is ordered, the audio-gen prototype is
reverted, and `includeGamma` carries `messageBlock: true`. The remaining
question is where a text consumer reads the url from.

**Recommendation: add the column.** Nullable, additive, `IMAGE_GEN` only,
the FINAL frame's url. Five reasons, one trade.

1. **Text consumers read blocks; the url is the one asset fact a text
   consumer needs.** Dims, mime, kind, lineage stay on the attachment for
   the renderer. A formatter, the CLI, a memory fold, TTS — every one of
   them iterates `messageBlocks` and none of them wants the attachment
   subtree.
2. **Thirteen formatters, no `Pick` widening.** `openai/workup.ts`,
   `meta/workup.ts`, `sakana/workup.ts` type `messageText` on
   `Pick<MessageSingleton<true>, "content" | "messageBlocks">`. With the
   column, each gets the positional form in three lines and the signature
   holds. With the join, each needs `"attachments"` in the `Pick` plus a
   blockId → url map.
3. **The value is already in hand at persist.** `inlineImageGenAggWorkup`
   reads `block.inlineImageData.cdnUrl` to pair rows and then drops it;
   `persistedMessageBlocks` (`chat-response.ts` L102-108) writes five
   fields off the same block. One more field, same map.
4. **It aligns the record with the wire.** `ChatChunkAndResMsgBlock`
   already carries the url in `inlineImageData`; the persisted block is the
   one place the field goes missing. "Blocks are the persisted record" —
   the record should not lose what the wire had.
5. **Precedent in this very feature.** `InlineImageGenOutput` carries
   `width / height / mime / ext` although `ImageMetadata` and `Attachment`
   hold them, so a one-off's row is self-sufficient. Same move, same
   reason.

**The trade:** the url now lives in two rows. If an inline attachment is
ever deleted, the block keeps a url to a gone object. Generated assets are
rarely deleted and a dead url in model context is harmless, but it is a
real second copy and should be said out loud. The invariant to hold, the
twin of `messageBlockId` ⇔ `IMAGE_GEN`: **`cdnUrl` is set ⇔ `type ===
"IMAGE_GEN"`, and it is the FINAL frame's url** (for OpenAI inline later,
persist writes the last frame's url the handler tracked at that ordinal,
which is the FINAL).

**"Only map the text from the image gen blocks?"** No. `content` on an
`IMAGE_GEN` block is the rewritten prompt — what the model *meant* to draw.
Without the url the history says an image was intended, not that one
exists at a location. Both, url first, caption under it.

### The edits

`packages/db/prisma/schema/messageblock.prisma` — one line:

```prisma
model MessageBlock {
  …
  durationMs     Int              @default(0)
  /// FINAL frame url, set on IMAGE_GEN blocks only
  cdnUrl         String?
  …
}
```

`chat-response.ts` L102-108 — one field:

```ts
const persistedMessageBlocks = data.messageBlocks?.map(block => ({
  content: block.content,
  conversationId: data.conversationId,
  durationMs: Math.round(block.durationMs),
  ordinal: block.ordinal,
  type: block.type,
  cdnUrl: block.inlineImageData?.cdnUrl
}));
```

`stream-workup.ts` `messageText` — the branch collapses to the block:

```ts
for (const block of msg.messageBlocks) {
  if (block.type === "TEXT") {
    textBlocks.push(block.content);
  }
  if (block.type === "IMAGE_GEN" && block.cdnUrl) {
    textBlocks.push(
      `![${msg.provider.toLowerCase()}/${msg.model}](${block.cdnUrl})\n\n${block.content}`
    );
  }
}
```

No `attachments` read, no `kind` check (the column holds the FINAL by
invariant), no url parsing. `MessageBlockSingleton` gains the field through
the Prisma `MessageBlock` type — nothing to add by hand.

### What the third arm now does, and the one decision left

With the url on the block, the third arm's only effect on provider history
is that the assistant-branch attachment loop in `formatxAIMsgHistory` sees
the inline rows and emits them a second time (§2 B4). Two ways to close
it; either is fine:

- **Keep the arm, add the one-line skip** (`if (att.messageBlockId)
  continue;` at L213). Other providers' formatters get the trailing form
  today with no edits, and each adds the same skip when its `messageText`
  gains the block branch. No gap, one line in a file you would rather not
  touch.
- **Drop the arm from the loaders.** Inline rows then reach provider
  history only through blocks; `formatxAIMsgHistory` is untouched. Other
  providers see nothing until their three-line `messageText` edit lands.
  Clean end state, a gap on the way there. (The arm is still right in
  the client-facing producers, which is where it was needed.)

Nothing else moves: the client keeps resolving dims and kind from the
attachment by `messageBlockId` (§10.11 d), the persist pairing keeps
parsing series id + ordinal (partials need it), the wire is unchanged.

---

## 8. `width` / `height` on the block too — yes (Andrew, same day)

Same reasoning as §7, and it lands harder on the client than `cdnUrl` does
on the server. The bubble paints an `IMAGE_GEN` slot from exactly four
facts — url, width, height, kind — and today the hydrated block has none
of them, which is why §10.11 needs a synthesized streaming attachment (b),
a `toMessageBlocks` derivation (c), and a `block → attachments` resolver
(d) before the component can draw. With the three columns on the row, a
persisted `IMAGE_GEN` block is **self-rendering**: the component reads the
block, nothing is joined.

Why this is safe where denormalization usually is not: **these three facts
are immutable.** A generated FINAL frame's url and dimensions never change
after persist — generated assets are `ALIASED`, no compat re-encode ever
touches them — so a copy taken at write time cannot drift. The only
failure mode is the one §7 already names: delete the attachment and the
block keeps stale paint facts. The invariant extends unchanged: **all
three set ⇔ `type === "IMAGE_GEN"`, and they describe the FINAL frame.**

What does *not* go on the block:

- **`kind`.** A committed block is FINAL by invariant; on the stream the
  frame carries `kind` in `inlineImageData` for the partial-vs-final
  decision. Persisting it would store a constant.
- **`mime`, `ext`, `seriesId`, `seriesOrdinal`, the two models,
  `revisedPrompt`.** Lineage, not paint. The url encodes ext, series and
  ordinal; `content` is the prompt; the rest lives on
  `InlineImageGenOutput`, which stays the provenance row and stays in the
  four producers' include for anything that wants to *show* lineage.
- **`aspectRatio`.** Derived from the two columns.

The third copy is the honest cost: `ImageMetadata.width` (the asset),
`InlineImageGenOutput.width` (the generated output), `MessageBlock.width`
(the slot). Three rows, three roles, one immutable number. Acceptable for
the same reason `InlineImageGenOutput` got its own copy: each row is
self-sufficient for its reader.

### Schema

```prisma
model MessageBlock {
  …
  durationMs     Int              @default(0)
  /// IMAGE_GEN only — the FINAL frame's url and dimensions (immutable, copied at persist)
  cdnUrl         String?
  width          Int?
  height         Int?
  …
}
```

### Persist (`chat-response.ts` L102-108)

```ts
const persistedMessageBlocks = data.messageBlocks?.map(block => ({
  content: block.content,
  conversationId: data.conversationId,
  durationMs: Math.round(block.durationMs),
  ordinal: block.ordinal,
  type: block.type,
  cdnUrl: block.inlineImageData?.cdnUrl,
  width: block.inlineImageData?.width,
  height: block.inlineImageData?.height
}));
```

### What it does to §10.11 (the pending client work)

| step | before | after |
| --- | --- | --- |
| (a) include parity | done | still right — lineage, trailing groups, tooltips — but **no longer load-bearing for paint** |
| (b) streaming attachment synthesized from `inlineImgGenData` | required to render | not needed for the inline slot; the wire block already carries the four facts |
| (c) `toMessageBlocks` | drops `inlineImageData` | maps the nested wire object onto the three columns: `{ ...block, cdnUrl: block.inlineImageData?.cdnUrl, width: …, height: … }` — legitimate now, the fields exist in the schema |
| (d) `inlineImageFor(block, attachments)` resolver | required | **gone** — the block is the source in both paths |
| (e) bubble `IMAGE_GEN` case | resolver → component | `block.cdnUrl && block.width && block.height` → component; `kind` from the live frame while streaming, FINAL once committed |
| (f) `InlineImageBlock` component | props from the resolver | props from the block; unchanged internally |

The wire stays as it is. `inlineImageData` remains one nested optional on
`ChatChunkAndResMsgBlock` because the object couples four fields to one
`type` in a way three independent optionals cannot; the DB columns are
independent nullables by nature, so the two shapes differ at that one
seam and `toMessageBlocks` is where they meet — which is what §10.11 (c)
said it was for.

Server side, `messageText` needs `cdnUrl` alone (§7). Nothing in the
formatters reads dims.

---

## 9. The wire block goes flat: `cdnUrl` / `width` / `height` on the `IMAGE_GEN` arm (Andrew, same day)

Once `MessageBlock` carries the three columns (§7, §8) and the wire block is
a conditional on `type` (Andrew's `ChatChunkAndResBlock`), the nested
`inlineImageData` object has no job left. It existed to couple four
optional fields to the discriminant on a flat wide type; the conditional
arm couples them now. So the fields sit flat on the `IMAGE_GEN` arm and
are absent on every other arm:

```ts
export type ChatChunkAndResBlock<
  T extends $Enums.MessageBlockType = $Enums.MessageBlockType
> = T extends "IMAGE_GEN"
  ? { type: T; content: string; ordinal: number; conversationId: string; durationMs: number;
      cdnUrl: string; width: number; height: number }
  : { type: T; content: string; ordinal: number; conversationId: string; durationMs: number };
```

- The wire block is a true subset of the DB row again. `toMessageBlocks`
  is `{ cdnUrl: null, width: null, height: null, ...block }` plus the ids
  it already mints — the three `null` defaults are what let the non-image
  arms satisfy the singleton's nullable-required columns.
- One read shape in both paths: `block.cdnUrl` / `block.width` /
  `block.height`, off a frame or out of Postgres.
- `kind` is dropped from the block. No DB home, FINAL by invariant once
  committed, Grok never emits anything else, and no consumer reads it
  today (the only `inlineImageData` read outside the xai handler is the
  persist pairing, which wants `cdnUrl`). The frame still carries it at
  frame level in `inlineImgGenData.inlineImageGenOutput.kind`. When the
  OpenAI inline lane needs partial styling, a wire-only `kind` on the
  `IMAGE_GEN` arm is one additive line then. `ChatChunkAndResInlineImageData`
  goes with it.
- Absent-not-optional on the other arms (§ probe, this session): reads on
  the wide union must narrow on `type` first, `in` narrows, and the
  `Exclude` on `GrokActiveMessageBlock.type` is still what lets the eight
  close sites construct from `activeBlock.type`.

Downstream edits:

| site | change |
| --- | --- |
| `responses-api-linear.ts` `imageBlock` | `cdnUrl, width: specs.width, height: specs.height` flat; `satisfies ChatChunkAndResBlock<"IMAGE_GEN">` |
| `chat-response.ts` `inlineImageGenAggWorkup` | `if (block.type !== "IMAGE_GEN") continue;` then `block.cdnUrl` |
| `chat-response.ts` `persistedMessageBlocks` | the three columns behind the same `type` check (they cannot be read off the wide union) |
| `apps/web` `toMessageBlocks` | the spread with three `null` defaults |
| CLI | nothing reads the field |
