#!/usr/bin/env node
import { SlipstreamReplService } from "@/repl.ts";

/**
 * aic [--workspace [root]] [--env dev|prod] [--no-markdown]
 *
 * --env is the composition-root injection point for the ws connection
 * string — the two addresses are deliberately hardcoded here (no secrets
 * involved; the handshake auth is the ?id= session validation). Flag
 * absent → undefined → the chain default (SLIPSTREAM_WS_URL → localhost).
 * Scanned rather than positional because aic's flags are order-free
 * (--workspace may precede or follow).
 */
const DEV_WS_URL = "ws://localhost:4000";
const PROD_WS_URL = "wss://ws.aicoalesce.com";

const envIdx = process.argv.indexOf("--env");
const envTarget = envIdx === -1 ? undefined : process.argv[envIdx + 1];

if (envTarget !== undefined && envTarget !== "dev" && envTarget !== "prod") {
  console.error(`aic: --env expects "dev" or "prod", received "${envTarget}"`);
  process.exit(1);
}

const repl = new SlipstreamReplService(
  envTarget === "prod"
    ? PROD_WS_URL
    : envTarget === "dev"
      ? DEV_WS_URL
      : undefined
);
repl.start().catch((err: unknown) => {
  console.error(repl.safeErrMsg(err));
  process.exit(1);
});
