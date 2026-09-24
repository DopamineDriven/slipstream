# AI Coalesce Turborepo &mdash; *Slipstream*

![AI Coalesce](https://assets.aicoalesce.com/generated/nrr6h4r4480f6kviycyo1zhf/1787196875269-ig_0f376ef80c416d25016a86754c92b88191a19a45b016263488-1.png)

## Typical Flows

- Ask a question with attachments:
  1) Client sends `asset_paste`/`asset_attached` → server returns presigned PUT instructions.
  2) Client uploads to S3 → sends `asset_upload_complete` → server finalizes and emits `asset_ready`.
  3) Client sends `ai_chat_request` with `batchId`/`draftId` → server streams `ai_chat_chunk` then `ai_chat_response`.

- Resume a stream after reconnect:
  - Server keeps `stream:state:<conversationId>` in Redis (chunks + metadata). On reconnect, server emits `stream:resumed` and a catch‑up `ai_chat_chunk` built from saved chunks.

---

Questions or improvements? The WS protocol and flows are defined in `packages/types`—start there for changes.

![Attachment Pipeline Overview](./misc/slipstream-overview-asset-pipeline-update-white.png)
