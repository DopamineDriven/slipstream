import type { EnhancedRedisPubSubOptions } from "@/service/types.ts";
import { EnhancedRedisPubSub } from "@/pubsub/enhanced-client.ts";

/** Canonical way to create and manage a single EnhancedRedisPubSub instance */
export type RedisPubSubContext = {
  client: EnhancedRedisPubSub; // the only thing downstream code should see
  connect: () => Promise<void>; // idempotent connect
  shutdown: () => Promise<void>;
};

export function createRedisPubSubContext(cfg: {
  url: string;
  ca: string;
  key: string;
  cert: string;
  host: string;
  options?: EnhancedRedisPubSubOptions;
}): RedisPubSubContext {
  const client = new EnhancedRedisPubSub(
    cfg.url,
    cfg.ca,
    cfg.key,
    cfg.cert,
    cfg.host,
    cfg.options
  );

  return {
    client,
    connect: async () => {
      // EnhancedRedisPubSub extends RedisInstance → provides connect()
      await client.connect();
      // (Typed subscribe internally duplicates sub clients & heartbeats.)
      // saveStreamState/getStreamState live on this client already.
    },
    shutdown: async () => {
      // Ensure subs/heartbeats are torn down before closing main client.
      try {
        await client.cleanup();
      } catch (err) {
        console.log(err);
      }
      try {
        await client.quit();
      } catch (err) {
        console.log(err);
      }
    }
  };
}
