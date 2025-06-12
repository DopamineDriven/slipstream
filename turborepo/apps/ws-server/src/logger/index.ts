import type { PrettyOptions } from "pino-pretty";
import { pino } from "pino";

const pinoPrettyOpts = {
  colorize: true,
  levelFirst: true,
  translateTime: true
} satisfies PrettyOptions;

const isProd = process.env.NODE_ENV === "production";

export const logger = pino({
  name: "ws-server",
  level: isProd ? "info" : "debug",
  ...(!isProd && {
    transport: {
      target: "pino-pretty",
      options: { ...pinoPrettyOpts }
    }
  })
});
