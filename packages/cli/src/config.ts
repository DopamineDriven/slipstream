import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

/**
 * Single-operator config (plan §0.1): auth is a constant, not a flow — the
 * session id rides ?id= at the handshake and the cookie defaults are Andrew's
 * real values so stashUserData/user_location behave exactly as they do for
 * the browser client. Expired session → redirect the human to the browser
 * (localhost:3030/auth/login or chat.aicoalesce.com/auth/login) — later.
 *
 * Dep-free base of the CLI service chain (config → context → client →
 * renderer → repl). Client-context concerns (edge fetch, cookie header,
 * userMetadata) live one layer up in ClientContext.
 */
export class CliConfigService {
  /**
   * Injected at the composition root (bin/aic.ts) from the --env flag —
   * prod/dev addresses are hardcoded there. Precedence: explicit ctor arg
   * (--env) → SLIPSTREAM_WS_URL → the dev default. Every class in the
   * chain threads this through its own constructor so the injection point
   * stays the top-level `new SlipstreamReplService(wsUrl)`.
   */
  constructor(
    protected wsUrl = process.env.SLIPSTREAM_WS_URL ??
      "ws://localhost:4000"
  ) {}

  public get loginUrl() {
    return (
      process.env.SLIPSTREAM_LOGIN_URL ?? "http://localhost:3030/auth/login"
    );
  }

  /**
   * the ?id= handshake param is the USER id — the server validates the
   * session on file for it (getAndValidateUserSessionById). Single-operator:
   * Andrew's id is the default; expired session → refresh via loginUrl in
   * the browser.
   */
  public get userId() {
    return process.env.SLIPSTREAM_USER_ID ?? "nrr6h4r4480f6kviycyo1zhf";
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
