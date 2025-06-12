import { createClient } from "redis";
import { logger } from "@/logger/index.ts";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
export const redis = createClient({ url: REDIS_URL });

(async () => await redis.connect())();
export function subscribeToMessages(
  channel: string,
  cb: (message: string) => void
) {
  const sub = redis.duplicate();
  sub.connect().then(() => {
    sub.subscribe(channel, msg => {
      cb(msg);
    });
    logger.info(`Subscribed to ${channel}`);
  });
  return async () => {
    await sub.unsubscribe(channel);
    await sub.quit();
  };
}

export async function publishMessage(channel: string, message: string) {
  await redis.publish(channel, message);
}
