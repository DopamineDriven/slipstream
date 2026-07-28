import type { CliIdentity, CookieKey, ServerlessClientContext } from "@/types.ts";
import { CliConfigService } from "@/config.ts";
import { COOKIE_KEYS } from "@/types.ts";
import type { UserMetadata } from "@slipstream/types";

/**
 * Client-context service (phase 2B) — fetches real server-derived values from
 * GET /api/client/context (apps/web `detectDeviceWorkup`) and serializes
 * them into the handshake Cookie header, retiring the ws-server's Barrington
 * fallback coincidence. Sits between CliConfigService and
 * SlipstreamClientService in the service chain (config → context → client →
 * renderer → repl). primeServerlessContext() is the only effect; everything else
 * derives. Zero ws-server changes — parsedCookies() already reads this.
 */
export class ClientContext extends CliConfigService {
  constructor(wsUrl?: string) {
    super(wsUrl);
  }

  /**
   * Real server-derived context, set by primeServerlessContext() before the
   * handshake. Undefined until then — or on fetch failure — in which case
   * the static defaults below remain in effect. Both userMetadata and
   * cookieHeader consult this.
   */
  protected serverlessContext?: ServerlessClientContext = undefined;

  /**
   * The exact twelve keys the ws-server's parsedCookies() allowlist
   * accepts — anything else in the payload (hostname, ios, isMac) never
   * serializes. Single source: types.ts.
   */
  protected readonly cookieKeys = COOKIE_KEYS;

  /**
   * GET endpoint reflecting x-vercel-* derived client context as JSON
   * (apps/web detectDeviceWorkup). Prod returns real values even for a
   * locally running CLI — the serverless route (node runtime) derives from the caller's request.
   */
  public get clientContextUrl() {
    return "https://chat.aicoalesce.com/api/client/context" as const;
  }

  /** CLI-authored identity — never taken from the server payload */
  public get cliIdentity() {
    return {
      ua: "slipstream-cli/1.0.0 (wsl2; node)",
      browserName: "SlipstreamCLI",
      browserVersion: "1.0.0",
      viewport: "desktop"
    } as const satisfies CliIdentity;
  }

  /** machine-truth timezone — beats IP-geo tz under VPNs */
  protected localTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  /**
   * machine-truth locale — sent as accept-language so the serverless route derives
   * locale the same way it does for browsers
   */
  protected localLocale() {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  }

  private isParseableLatLng(latlng: string) {
    const parts = latlng.split(",");
    return parts.length === 2 && parts.every(p => Number.isFinite(Number(p)));
  }

  private safeDecode(value: string) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  protected isServerlessClientContext(v: unknown): v is ServerlessClientContext {
    if (typeof v !== "object" || v === null) return false;
    const rec = v as Partial<Record<keyof ServerlessClientContext, unknown>>;
    return (
      typeof rec.city === "string" &&
      typeof rec.locale === "string" &&
      typeof rec.ip === "string" &&
      typeof rec.country === "string" &&
      typeof rec.region === "string" &&
      typeof rec.postalCode === "string" &&
      typeof rec.tz === "string" &&
      typeof rec.latlng === "string" &&
      this.isParseableLatLng(rec.latlng)
    );
  }

  /**
   * Vercel's x-vercel-ip-city header arrives URI-encoded ("Oak%20Ridge")
   * and detectDeviceWorkup passes it through raw — decode at this boundary
   * so cookiePairs/serverlessToUserMetadata deal in clean values.
   */
  protected normalizeServerlessClientContext(ctx: ServerlessClientContext) {
    return {
      ...ctx,
      city: this.safeDecode(ctx.city)
    } satisfies ServerlessClientContext;
  }

  /**
   * server geo + CLI identity + machine tz → the twelve-key record the
   * ws-server allowlist accepts. Identity always wins over server geo for
   * ua/browserName/browserVersion/viewport.
   */
  protected cookiePairs(ctx: ServerlessClientContext, tz = this.localTimezone()) {
    const identity = this.cliIdentity;
    return {
      city: ctx.city,
      locale: ctx.locale,
      ua: identity.ua,
      ip: ctx.ip,
      via: "cli",
      country: ctx.country,
      latlng: ctx.latlng,
      tz,
      region: ctx.region,
      postalCode: ctx.postalCode,
      browserName: identity.browserName,
      browserVersion: identity.browserVersion,
      viewport: identity.viewport
    } satisfies Record<CookieKey, string>;
  }

  /**
   * encode-once discipline: the ws-server's parsedCookies() applies
   * decodeURIComponent exactly once per value, so one encodeURIComponent
   * here round-trips latlng commas, tz slashes, and raw ua strings
   * losslessly. Iterating cookieKeys guarantees only the twelve serialize.
   */
  protected serializeCookieHeader(pairs: Record<CookieKey, string>) {
    return this.cookieKeys
      .map(k => `${k}=${encodeURIComponent(pairs[k])}`)
      .join("; ");
  }

  /**
   * server geo → per-message ai_chat_request.metadata (identity fields
   * excluded — ua stays CLI-authored)
   */
  protected serverlessToUserMetadata(
    ctx: ServerlessClientContext,
    tz = this.localTimezone()
  ) {
    const [lat, lng] = [
      Number.parseFloat(ctx.latlng.slice(0, ctx.latlng.lastIndexOf(","))),
      Number.parseFloat(ctx.latlng.slice(ctx.latlng.lastIndexOf(",") + 1))
    ];
    return {
      city: ctx.city,
      region: ctx.region,
      country: ctx.country,
      postalCode: ctx.postalCode,
      via: "cli",
      locale: ctx.locale,
      ip: ctx.ip,
      lat,
      lng,
      tz
    } satisfies UserMetadata;
  }

  /**
   * One GET at startup — primes serverlessContext for userMetadata/cookieHeader.
   * Degrades to undefined on any failure (timeout, non-200, malformed
   * payload) so a server blip never blocks a session; the static defaults
   * stay in effect.
   */
  public async primeServerlessContext(timeoutMs = 3500) {
    const identity = this.cliIdentity;
    try {
      const res = await fetch(this.clientContextUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "accept-language": this.localLocale(),
          "user-agent": identity.ua,
          "x-aic-client": `${identity.browserName}/${identity.browserVersion}`
        }
      });
      if (!res.ok) return undefined;
      const data: unknown = await res.json();
      this.serverlessContext = this.isServerlessClientContext(data)
        ? this.normalizeServerlessClientContext(data)
        : undefined;
      return this.serverlessContext;
    } catch {
      return undefined;
    }
  }

  /**
   * Static defaults (single-operator, plan §0.1) merged with real
   * server-derived values once primeServerlessContext() lands — the same metadata
   * shape the browser client derives from the proxy cookies, reusable both
   * for the handshake Cookie header and ai_chat_request.metadata
   */
  public get userMetadata() {
    const base = {
      city: "Barrington",
      region: "Illinois",
      country: "US",
      tz: "America/Chicago",
      postalCode: "60010",
      lat: 41.8338486,
      lng: -87.8966849,
      locale: "en-US",
      ua: this.cliIdentity.ua,
      via: "cli",
      ip: "127.0.0.1"
    } as const satisfies UserMetadata;
    const ctx = this.serverlessContext;
    return ctx
      ? ({ ...base, ...this.serverlessToUserMetadata(ctx) } satisfies UserMetadata)
      : base;
  }

  /**
   * UserMetadata → the Cookie header parsedCookies() reads at the
   * handshake. Encode-once discipline: the server decodes each value
   * exactly once, so both branches serialize raw values through
   * serializeCookieHeader.
   */
  public get cookieHeader() {
    const ctx = this.serverlessContext;
    if (ctx) {
      return this.serializeCookieHeader(this.cookiePairs(ctx));
    }
    const m = this.userMetadata;
    const identity = this.cliIdentity;
    return this.serializeCookieHeader({
      city: m.city,
      region: m.region,
      country: m.country,
      tz: m.tz,
      via: "cli",
      postalCode: m.postalCode,
      locale: m.locale,
      ip: m.ip,
      latlng: `${m.lat},${m.lng}`,
      ua: identity.ua,
      viewport: identity.viewport,
      browserName: identity.browserName,
      browserVersion: identity.browserVersion
    });
  }
}
