import type { AttachmentSingleton } from "@slipstream/types";

type Listener = () => void;
const EMPTY_BUCKET: readonly AttachmentSingleton<true>[] = [];

/**
 * The client mirror of the server's per-user attachment registry: bucket key
 * (conversationId | "new-chat") → attachmentId → row. The server owns the
 * registry and pushes whole buckets after every connection plus one row per
 * write; this side merges nothing — `setBucket` replaces, `setOne` sets (and
 * moves a row whose key changed, which is a rekey arriving).
 *
 * Snapshots follow the ChatStore idiom: the per-id snapshot is the row object
 * itself (stable until the server pushes a new one), the per-bucket snapshot
 * is an array rebuilt only when that bucket changes — so a consumer re-renders
 * only when its own row or bucket does, never per token.
 */
export class AttachmentRegistryStore {
  private buckets = new Map<string, Map<string, AttachmentSingleton<true>>>();
  private snapshots = new Map<string, readonly AttachmentSingleton<true>[]>();
  private bucketOf = new Map<string, string>();
  private readonly listeners = new Set<Listener>();

  public readonly subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  public readonly getAttachment = (attachmentId: string) => {
    const key = this.bucketOf.get(attachmentId);
    return key ? this.buckets.get(key)?.get(attachmentId) : undefined;
  };

  public readonly getBucket = (bucketKey: string) =>
    this.snapshots.get(bucketKey) ?? EMPTY_BUCKET;

  public readonly getServerAttachment = () => undefined;
  public readonly getServerBucket = () => EMPTY_BUCKET;

  /** hydrate_attachments_ack / hydrate_attachments_by_conversation_id_ack */
  public setBucket(bucketKey: string, rows: AttachmentSingleton<true>[]) {
    for (const id of this.buckets.get(bucketKey)?.keys() ?? []) {
      this.bucketOf.delete(id);
    }
    const bucket = new Map<string, AttachmentSingleton<true>>();
    for (const row of rows) {
      bucket.set(row.id, row);
      this.bucketOf.set(row.id, bucketKey);
    }
    this.buckets.set(bucketKey, bucket);
    this.rebuild(bucketKey);
    this.notify();
  }

  /** hydrate_attachment_by_id_ack */
  public setOne(bucketKey: string, row: AttachmentSingleton<true>) {
    const prev = this.bucketOf.get(row.id);
    if (prev && prev !== bucketKey) this.dropFrom(prev, row.id);
    this.buckets
      .getOrInsertComputed(
        bucketKey,
        () => new Map<string, AttachmentSingleton<true>>()
      )
      .set(row.id, row);
    this.bucketOf.set(row.id, bucketKey);
    this.rebuild(bucketKey);
    this.notify();
  }

  public reset() {
    this.buckets.clear();
    this.snapshots.clear();
    this.bucketOf.clear();
    this.notify();
  }

  private dropFrom(bucketKey: string, attachmentId: string) {
    const bucket = this.buckets.get(bucketKey);
    bucket?.delete(attachmentId);
    this.bucketOf.delete(attachmentId);
    if (bucket?.size === 0) {
      this.buckets.delete(bucketKey);
      this.snapshots.delete(bucketKey);
    } else this.rebuild(bucketKey);
  }

  /** createdAt asc — the server's within-bucket order */
  private rebuild(bucketKey: string) {
    const bucket = this.buckets.get(bucketKey);
    if (!bucket) return;
    this.snapshots.set(
      bucketKey,
      Array.from(bucket.values()).sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    );
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}
