import type {
  RedisClientType,
  RedisDefaultModules,
  RedisFunctions,
  RedisModules,
  RedisScripts,
  RespVersions,
  TypeMapping
} from "redis";
import * as dotenv from "dotenv";
import { createClient } from "redis";
import type { RedisArg, RedisVariadicArg } from "@/service/types.ts";

dotenv.config();

export class RedisInstance {
  #client: RedisClientType<
    RedisDefaultModules & RedisModules,
    RedisFunctions,
    RedisScripts,
    RespVersions,
    TypeMapping
  >;
  constructor(public url: string) {
    this.#client = createClient({ url });
  }

  /** Connect the *main* client */
  public async connect() {
    await this.#client.connect();
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
    await this.#client.quit();
  }
  public async subscribeToMessages(
    channel: string | string[],
    cb: (message: string) => void
  ) {
    const sub = this.#client.duplicate();
    await sub.connect();
    await sub.subscribe(channel, cb);
    return async () => {
      await sub.unsubscribe(channel);
      await sub.quit();
    };
  }

  public publish(channel: RedisArg, message: RedisArg) {
    return this.#client.publish(channel, message);
  }

  public rPush(key: RedisArg, value: RedisVariadicArg) {
    return this.#client.rPush(key, value);
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
}

export const redisService = new RedisInstance(
  process.env.REDIS_URL ?? "redis://redis:6379"
);
