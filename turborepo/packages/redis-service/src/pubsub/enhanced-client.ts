import type {
  AllEvents,
  ExtendedEventMap,
  StreamStateProps
} from "@/pubsub/extended-events.ts";
import type {
  EnhancedRedisPubSubOptions,
  RedisArg,
  RedisClientEntity
} from "@/service/types.ts";
import type { EventTypeMap } from "@slipstream/types";
import { RedisInstance } from "@/service/index.ts";

export class EnhancedRedisPubSub extends RedisInstance {
  private subscribers = new Map<
    string,
    Set<<const T extends keyof AllEvents>(data: AllEvents[T]) => void>
  >();
  private subscriptionClients = new Map<string, RedisClientEntity>();
  private subHeartbeats = new Map<string, NodeJS.Timeout>();
  private options: Required<EnhancedRedisPubSubOptions>;

  constructor(
    url: string,
    ca: string,
    key: string,
    cert: string,
    host: string,
    options: EnhancedRedisPubSubOptions = {}
  ) {
    super(url, ca, key, cert, host);
    this.options = {
      heartbeatInterval: options.heartbeatInterval ?? 20000,
      enableHeartbeat: options.enableHeartbeat ?? true
    };
  }

  /**
   * Type-safe event publishing for both original and extended events
   */
  public async publishTypedEvent<const T extends keyof AllEvents>(
    channel: RedisArg,
    event: T,
    data: AllEvents[T]
  ) {
    if ("type" in data && data.type !== event) {
      console.warn(`Event type mismatch: expected ${event}, got ${data.type}`);
    }
    if (event !== data.type) throw new Error("event type mismatch");
    const payload = {
      ...data,
      timestamp: "timestamp" in data ? data.timestamp : Date.now()
    };

    await this.publish(channel, JSON.stringify(payload));
  }

  /**
   * Creates a heartbeat function for a Redis client
   */
  private createHeartbeat(
    subClient: RedisClientEntity,
    channel: string
  ): () => void {
    return () => {
      subClient.ping().catch(err => {
        console.error(`Heartbeat failed for channel ${channel}:`, err);
        // Optional: Implement reconnection logic here
      });
    };
  }

  /**
   * Type-safe event subscription with automatic cleanup and heartbeat
   */
  public async subscribe<const T extends keyof AllEvents>(
    channel: string,
    event: T,
    handler: <const V extends keyof AllEvents>(data: AllEvents[V]) => void
  ): Promise<() => Promise<void>> {
    // Create dedicated client for this subscription
    if (!this.subscriptionClients.has(channel)) {
      const subClient = this.client.duplicate();
      await subClient.connect();
      this.subscriptionClients.set(channel, subClient);

      // Set up heartbeat to keep connection alive
      if (this.options.enableHeartbeat) {
        const heartbeat = setInterval(
          this.createHeartbeat(subClient, channel),
          this.options.heartbeatInterval
        );
        heartbeat.unref();
        this.subHeartbeats.set(channel, heartbeat);
      }

      // Set up the base subscription
      await subClient.subscribe(channel, message => {
        try {
          const parsed = JSON.parse(message) as AllEvents[T];
          const handlers = this.subscribers.get(`${channel}:${parsed.type}`);
          if (handlers) {
            handlers.forEach(h => h(parsed));
          }
        } catch (err) {
          console.error(`Error parsing message on ${channel}: `, err);
        }
      });
    }

    // Register the specific event handler
    const key = `${channel}:${event}`;
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    const getKey = this.subscribers.get(key);
    if (!getKey)
      throw new Error(`${key} not able to be retrieved in subscribe workup`);
    getKey.add(handler);

    // Return cleanup function
    return async () => {
      const handlers = this.subscribers.get(key);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.subscribers.delete(key);
        }
      }

      // Clean up client if no more handlers for this channel
      const hasMoreHandlers = Array.from(this.subscribers.keys()).some(k =>
        k.startsWith(`${channel}:`)
      );

      if (!hasMoreHandlers) {
        const client = this.subscriptionClients.get(channel);
        if (client) {
          await client.unsubscribe(channel);
          await client.quit();
          this.subscriptionClients.delete(channel);
        }

        // Clean up heartbeat
        const heartbeat = this.subHeartbeats.get(channel);
        if (heartbeat) {
          clearInterval(heartbeat);
          this.subHeartbeats.delete(channel);
        }
      }
    };
  }

  /**
   * Stream state management for resumable streams
   * Stores the chunks from ai_chat_chunk events for resume capability
   */
  public async saveStreamState(
    conversationId: string,
    chunks: string[],
    metadata: {
      model?: string;
      provider?: string;
      title?: string;
      totalChunks: number;
      completed: boolean;
      systemPrompt?: string;
      temperature?: number;
      topP?: number;
    },
    thinkingChunks?: string[]
  ): Promise<void> {
    const key = `stream:state:${conversationId}`;
    const multi = this.client.multi();
    const data: Record<string, string> = {
      chunks: JSON.stringify(chunks),
      metadata: JSON.stringify(metadata)
    };
    if (thinkingChunks && thinkingChunks.length > 0) {
      data.thinkingChunks = JSON.stringify(thinkingChunks);
    }

    multi.hSet(key, data);
    multi.expire(key, 3600); // 1 hour TTL
    await multi.exec();
  }

  public async getStreamState(
    conversationId: string
  ): Promise<StreamStateProps | null> {
    const key = `stream:state:${conversationId}`;
    const data = await this.hGetAll(key);

    if (!data.chunks || !data.metadata) return null;

    return {
      chunks: JSON.parse(data.chunks) as StreamStateProps["chunks"],
      metadata: JSON.parse(data.metadata) as StreamStateProps["metadata"],
      ...(typeof data.thinkingChunks !== "undefined" && {
        thinkingChunks: JSON.parse(
          data.thinkingChunks
        ) as StreamStateProps["thinkingChunks"]
      })
    };
  }

  /**
   * Helper to broadcast existing EventTypeMap events to pub/sub channels
   * This allows WebSocket events to also be available via pub/sub
   */
  public async bridgeWebSocketEvent<const T extends keyof EventTypeMap>(
    event: T,
    data: ExtendedEventMap[T],
    channels: string[]
  ): Promise<void> {
    await Promise.all(
      channels.map(channel => this.publishTypedEvent(channel, event, data))
    );
  }

  /**
   * Cleanup method to disconnect all clients and clear heartbeats
   */
  public async cleanup(): Promise<void> {
    // Clear all heartbeats
    for (const heartbeat of this.subHeartbeats.values()) {
      clearInterval(heartbeat);
    }
    this.subHeartbeats.clear();

    // Disconnect all subscription clients
    for (const [channel, client] of this.subscriptionClients) {
      try {
        await client.unsubscribe(channel);
        await client.quit();
      } catch (err) {
        console.error(`Error cleaning up client for ${channel}:`, err);
      }
    }
    this.subscriptionClients.clear();
    this.subscribers.clear();
  }
}
