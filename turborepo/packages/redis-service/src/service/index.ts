import type {
  RedisArg,
  RedisClientEntity,
  RedisHashType,
  RedisVariadicArg
} from "@/service/types.ts";
import * as dotenv from "dotenv";
import { createClient } from "redis";

dotenv.config({ quiet: true });

export class RedisInstance {
  #isConnecting = false;
  #connectionPromise: Promise<void> | null = null;
  #client: RedisClientEntity;
  // Singleton instance storage
  private static instance: RedisInstance | null = null;
   constructor(public url: string) {
    this.#client = createClient({
      url,
      pingInterval: 30000,
      socket: {
        keepAlive: true,
        keepAliveInitialDelay: 10000,
        noDelay: true,
        connectTimeout: 10000,
        reconnectStrategy: (retries, cause) => {
          if (retries > 20) {
            console.error("Max reconnection attempts reached");
            return new Error(
              "Max reconnection attempts reached " + cause.message
            );
          }

          console.log(
            `Reconnecting attempt ${retries}, cause: `,
            cause?.message
          );

          const backoff = Math.min(Math.pow(2, retries) * 100, 5000);
          const jitter = Math.random() * 100;
          return backoff + jitter;
        }
      },
      disableOfflineQueue: false
    });
    this.setupEventHandlers();
  }
  protected get client(): RedisClientEntity {
    return this.#client;
  }
  private setupEventHandlers() {
    this.#client.on("error", err => {
      console.error("Redis error:", err);
    });

    this.#client.on("connect", () => {
      console.log("Redis connected");
    });

    this.#client.on("ready", () => {
      console.log("Redis ready to accept commands");
    });

    this.#client.on("reconnecting", () => {
      console.log("Redis reconnecting…");
    });

    this.#client.on("end", () => {
      console.log("Redis connection closed");
    });
  }

  /**
   * Get the singleton instance of RedisInstance
   * @param url Optional Redis URL - only used on first call
   * @returns The singleton RedisInstance
   */
  public static getInstance(url?: string): RedisInstance {
    if (!RedisInstance.instance) {
      const redisUrl = url ?? process.env.REDIS_URL ?? "redis://redis:6379";
      RedisInstance.instance = new RedisInstance(redisUrl);
    }
    return RedisInstance.instance;
  }

  public static async resetInstance(): Promise<void> {
    if (RedisInstance.instance) {
      await RedisInstance.instance.close();
      RedisInstance.instance = null;
    }
  }

  /** Connect the *main* client */
  public async connect() {
    // Prevent multiple simultaneous connection attempts
    if (this.#isConnecting && this.#connectionPromise) {
      return this.#connectionPromise;
    }

    if (this.isReady()) {
      return;
    }

    this.#isConnecting = true;
    this.#connectionPromise = this.#client
      .connect()
      .then(() => {
        this.#isConnecting = false;
        this.#connectionPromise = null;
      })
      .catch(err => {
        this.#isConnecting = false;
        this.#connectionPromise = null;
        throw new Error(
          "error connecting in connection promise" +
            (err instanceof Error ? err.message : "")
        );
      });

    return this.#connectionPromise;
  }

  public isOpen() {
    return this.#client.isOpen;
  }

  public isPubSubActive() {
    return this.#client.isPubSubActive;
  }

  public isReady() {
    return this.#client.isReady;
  }

  /** Disconnect the *main* client */
  public async quit(): Promise<void> {
    await this.#client.close();
  }
  public async subscribeToMessages(
    channel: string | string[],
    cb: (message: string, channel: string) => void
  ) {
    const sub = this.#client.duplicate();
    sub.on("error", err => {
      console.error("Redis subscriber error:", err);
    });
    await sub.connect();
    await sub.subscribe(channel, cb);
    return async () => {
      try {
        await sub.unsubscribe(channel);
        await sub.quit();
      } catch (err) {
        if (err instanceof Error)
          console.error("error cleaning up subscriber", err.message);
        sub.destroy();
      }
    };
  }

  public destroy() {
    this.#client.destroy();
  }
  public async close(): Promise<void> {
    try {
      await this.#client.close();
    } catch (err) {
      if (err instanceof Error) {
        console.error("Error during Redis close: ", err.message);
      }
      console.error("Error during Redis close:");
      // Force destroy if graceful close fails
      this.#client.destroy();
    }
  }
  public publish(channel: RedisArg, message: RedisArg) {
    return this.#client.publish(channel, message);
  }

  public rPush(key: RedisArg, value: RedisVariadicArg) {
    return this.#client.rPush(key, value);
  }

  public async ping(): Promise<string> {
    try {
      return await this.#client.ping();
    } catch (err) {
      if (err instanceof Error) console.error("Redis ping failed: ", err);

      throw new Error("Redis ping failed");
    }
  }

  private async ensureConnection() {
    if (!this.isReady()) {
      await this.connect();
    }
  }

  /**
   *
   *
   * @param {RedisArg} key

   * @param {number} seconds

   * @param {"NX" | "XX" | "GT" | "LT" | undefined} mode

   * @description
    NX -- Set expiry only when the key has no expiry
   *
    XX -- Set expiry only when the key has an existing expiry
   *
    GT -- Set expiry only when the new expiry is greater than current one
   *
    LT -- Set expiry only when the new expiry is less than current one
   *
   *
   A non-volatile key is treated as an infinite TTL for the purpose of GT and LT. The GT, LT and NX options are mutually exclusive.
   */
  public expire(
    key: RedisArg,
    seconds: number,
    mode?: "NX" | "XX" | "GT" | "LT"
  ) {
    return this.#client.expire(key, seconds, mode);
  }
  // method for Redis DEL command (for cleanup)
  public del(key: RedisArg | RedisArg[]) {
    return this.#client.del(key);
  }

  // method for Redis KEYS command (for stream analysis)
  public keys(pattern: RedisArg) {
    return this.#client.keys(pattern);
  }

  // method for Redis TTL command (for stream analysis)
  public ttl(key: RedisArg) {
    return this.#client.ttl(key);
  }
  public hSet(key: RedisArg, field: RedisHashType, value: RedisHashType) {
    return this.#client.hSet(key, field, value);
  }

  public hGetAll(key: RedisArg) {
    return this.#client.hGetAll(key);
  }
  // Enhanced publish method with error handling
  public async publishEvent<const T>(channel: RedisArg, message: T) {
    try {
      await this.ensureConnection();
      return await this.#client.publish(channel, JSON.stringify(message));
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error publishing event:", error);
        throw new Error(error.message);
      } else {
        console.error(`error publishing event on channel `, channel);
      }
    }
  }

  /** method to get stream data (if needed for analysis) */
  public lRange(key: RedisArg, start: number, stop: number) {
    return this.#client.lRange(key, start, stop);
  }

  /** method to get stream length */
  public lLen(key: RedisArg) {
    return this.#client.lLen(key);
  }

  // Enhanced subscription method that returns the subscriber instance
  public async createSubscriber() {
    const subscriber = this.#client.duplicate();
    subscriber.on("error", err => {
      console.error("Redis subscriber error:", err);
    });
    await subscriber.connect();
    return subscriber;
  }
}
