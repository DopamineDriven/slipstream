import * as dotenv from "dotenv";
import type { UserMetadata } from "@slipstream/types";

dotenv.config({ quiet: true });

/**
 * Single-operator config (plan §0.1): auth is a constant, not a flow — the
 * session id rides ?id= at the handshake and the cookie defaults are Andrew's
 * real values so stashUserData/user_location behave exactly as they do for
 * the browser client. Expired session → redirect the human to the browser
 * (localhost:3030/auth/login or chat.aicoalesce.com/auth/login) — later.
 *
 * Dep-free base of the CLI service chain (config → client → renderer → repl).
 */
export class CliConfigService {
  public get wsUrl() {
    return process.env.SLIPSTREAM_WS_URL ?? "ws://localhost:4000";
  }

  public get loginUrl() {
    return (
      process.env.SLIPSTREAM_LOGIN_URL ?? "http://localhost:3030/auth/login"
    );
  }

  public get sessionId() {
    const sessionId = process.env.SLIPSTREAM_SESSION_ID;
    if (!sessionId) {
      console.error(
        `SLIPSTREAM_SESSION_ID is required (packages/cli/.env) — grab one after ${this.loginUrl}`
      );
      process.exit(1);
    }
    return sessionId;
  }

  /**
   * Andrew's real values (single-operator, plan §0.1) — the same metadata
   * shape the browser client derives from the proxy cookies, reusable both
   * for the handshake Cookie header and ai_chat_request.metadata
   */
  public get userMetadata() {
    return {
      city: "Barrington",
      region: "Illinois",
      country: "US",
      tz: "America/Chicago",
      postalCode: "60010",
      lat: 41.8338486,
      lng: -87.8966849,
      locale: "en-US",
      ua: "slipstream-cli/1.0.0 (wsl2; node)",
      ip: "127.0.0.1"
    } as const satisfies UserMetadata;
  }

  /** UserMetadata → the Cookie header parsedCookies() reads at the handshake */
  public get cookieHeader() {
    const m = this.userMetadata;
    const pairs = {
      city: m.city,
      region: m.region,
      country: m.country,
      tz: m.tz,
      postalCode: m.postalCode,
      locale: m.locale,
      ip: m.ip,
      latlng: `${m.lat},${m.lng}`,
      ua: encodeURIComponent(m.ua),
      viewport: "desktop",
      browserName: "SlipstreamCLI",
      browserVersion: "1.0.0"
    };
    return Object.entries(pairs)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  public safeErrMsg(err: unknown) {
    if (err instanceof Error) {
      return err.message;
    } else if (typeof err === "object" && err != null) {
      return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
    } else if (typeof err === "string") {
      return err;
    } else if (typeof err === "number") {
      return err.toPrecision(5);
    } else if (typeof err === "boolean") {
      return `${err}`;
    } else return JSON.stringify(err);
  }
}
