// ports/pubsub.ts
export interface RawPubSub {
  /** Publish a raw JSON string to a channel */
  publishRaw(channel: string, message: string): Promise<void>;

  /** Subscribe to a channel; returns an unsubscribe fn */
  subscribeRaw(
    channel: string,
    onMessage: (message: string) => void
  ): Promise<() => Promise<void>>;

  /** Pattern subscribe, e.g. "stream:*" (optional but handy) */
  pSubscribeRaw?(
    pattern: string,
    onMessage: (message: string, channel: string) => void
  ): Promise<() => Promise<void>>;
}
