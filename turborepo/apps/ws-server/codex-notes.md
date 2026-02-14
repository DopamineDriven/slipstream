# Populate `originatingModel`/`originatingProvider` & Consolidate User Store Indexing to Single Path

## Context

The resolver's `handleAIChatRequestIndexing` already has the full `MessageSingleton<true>[]` with nested `AttachmentSingleton<true>` objects. `Message` carries `provider: Provider` (non-nullable) and `model: string | null` (always non-null in practice). But the current code discards all of that by extracting only `attachmentId: string`, re-querying the attachment via `getTargetedAtt`, and hardcoding `originatingModel`/`originatingProvider` to `null`.

Additionally, the PDF webhook in `pdf/index.ts` has its own `scheduleUserStoreIndexing` that calls `indexAttachmentById` after Adobe compat conversion. This creates a race condition: if compat conversion finishes before the user sends a message (which it usually does — under 1 second), both the resolver and the webhook can fire `indexAttachment` concurrently for the same attachment. The `upsertUserStoreDoc` is safe (it's an upsert by `attachmentId`), but the full pipeline after it — PDF extraction, chunking, Voyage embedding calls, chunk creation — would duplicate work and potentially throw on unique constraints.

**Solution**: Add client-side guarding that compat conversion finishes before message submission is allowed (user to implement on Next.js side), then remove the PDF webhook's indexing path entirely. One entry point, no race.

## Files to Modify

1. `apps/ws-server/src/resolver/index.ts` — thread attachment + message through
2. `apps/ws-server/src/store/vector-store.ts` — add model/provider params to `indexAttachment`, remove `indexAttachmentById`
3. `apps/ws-server/src/pdf/index.ts` — remove `scheduleUserStoreIndexing`, its call at line 276, and the `UserStoreVectorService` constructor dependency (line 28) + import (line 4)

## Changes

### 1. `apps/ws-server/src/resolver/index.ts`

**`handleAIChatRequestIndexing` (lines 122-134)** — pass full attachment + parent message, early-exit if no DOCUMENT attachments:

```ts
private handleAIChatRequestIndexing(
  msgs: MessageSingleton<true>[],
  requestMessageId: string | undefined
) {
  if (!requestMessageId) return;
  const requestMsg = msgs.find(m => m.id === requestMessageId);
  if (!requestMsg) return;
  const docs = requestMsg.attachments.filter(
    (att): att is AttachmentSingleton<true> & { assetType: "DOCUMENT" } =>
      att.assetType === "DOCUMENT"
  );
  if (docs.length === 0) return;
  for (const att of docs) {
    this.scheduleUserStoreIndexing(att, requestMsg);
  }
}
```

Drop the `async` — nothing is awaited. The explicit `docs.length === 0` guard skips the pipeline entirely when there are no document attachments (the common case for most chat requests).

**`scheduleUserStoreIndexing` (lines 103-120)** — accept full attachment + parent message, call `indexAttachment` directly (bypasses the now-removed `indexAttachmentById`):

```ts
private scheduleUserStoreIndexing(
  attachment: AttachmentSingleton<true>,
  message: MessageSingleton<true>
) {
  void this.userVectorStore
    .indexAttachment(attachment, message)
    .then(result => {
      if (!result.ok) {
        this.logger.debug(
          { attachmentId: attachment.id, reason: result.reason },
          "skip indexing"
        );
      }
    })
    .catch(err => {
      this.logger.warn(
        { attachmentId: attachment.id, err: this.wsServer.prisma.safeErrMsg(err) },
        "indexing failed"
      );
    });
}
```

**Call site (line 415)** — unchanged (already passes `msgs` and `requestMessageId`).

Imports: verify `AttachmentSingleton` and `MessageSingleton` are imported from `@slipstream/types`.

### 2. `apps/ws-server/src/store/vector-store.ts`

**`indexAttachment` (line 575)** — accept `MessageSingleton<true>` instead of decomposed model/provider params. The message carries both `model` and `provider`, and keeps the door open for extracting user content for context enhancement later:

```ts
public async indexAttachment(
  attachment: AttachmentSingleton<true>,
  message: MessageSingleton<true>,
  storeName?: string
): Promise<UserStoreIndexResult> {
```

At lines 655-656, replace `null` with message fields:
```ts
originatingModel: message.model,
originatingProvider: message.provider,
```

Add `MessageSingleton` to imports from `@slipstream/types`.

**Remove `indexAttachmentById` (lines 913-918)** — no longer needed. The resolver passes full data directly, and the PDF webhook path is being removed. No other callers remain.

### 3. `apps/ws-server/src/pdf/index.ts`

Remove three things:
- **`scheduleUserStoreIndexing` method** (lines 31-47)
- **Its call** at line 276 (`this.scheduleUserStoreIndexing(attachmentId)`)
- **`UserStoreVectorService` constructor dependency** (line 28: `private userStore: UserStoreVectorService`) and its import (line 4: `import { UserStoreVectorService } from "@/store/vector-store.ts"`)

`userStore` is only used for `scheduleUserStoreIndexing` — no other references in the file. One instantiation site: `apps/ws-server/src/index.ts:130-137` — remove the `userStore` arg (line 136).

## What NOT to Change

- `getTargetedAtt` stays — still used by `xai/workup.ts`
- `upsertUserStoreDoc` unchanged — already accepts the params
- No schema changes — `originatingModel` and `originatingProvider` columns already exist and are indexed
- Call site at resolver line 415 unchanged — same two args
- No `getMessageModelProvider` prisma method needed — model/provider come from the message object directly

## Client-side prerequisite (user to implement)

Block message submission until any PENDING compat conversions for attached documents are complete (ACTIVE/ALIASED). This ensures the resolver path always sees a finalized attachment. The `preflightAttachment` guard at `workup.ts:153` returns `WAIT_COMPAT_ACTIVE` for PENDING attachments, which would silently skip indexing without error — but the point is to never hit that case.

## Verification

1. `pnpm --filter @slipstream/ws-server typecheck` — must pass cleanly
2. Manual: trigger AI chat with a PDF attachment → check `UserStoreDoc` record has `originatingModel` and `originatingProvider` populated
3. Verify no remaining references to `indexAttachmentById`
4. Verify PDF webhook still works for compat conversion (just no longer triggers indexing)
