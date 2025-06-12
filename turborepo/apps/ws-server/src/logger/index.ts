import type { PrettyOptions } from "pino-pretty";

export const pinoPrettyOpts = {
  colorize: true,
  levelFirst: true,
  translateTime: true
} satisfies PrettyOptions;

export const isProd = process.env.NODE_ENV === "production";

const pino = await import("pino").then(d => d.pino);

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
