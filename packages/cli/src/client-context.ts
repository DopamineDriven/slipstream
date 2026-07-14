import type { CliIdentity, CookieKey, EdgeClientContext } from "@/types.ts";
import { CliConfigService } from "@/config.ts";
import { COOKIE_KEYS } from "@/types.ts";
import type { UserMetadata } from "@slipstream/types";

/**
 * Client-context service (phase 2B) — fetches real edge-derived values from
 * GET /api/client/context (apps/web `detectDeviceWorkup`) and serializes
 * them into the handshake Cookie header, retiring the ws-server's Barrington
 * fallback coincidence. Sits between CliConfigService and
 * SlipstreamClientService in the service chain (config → context → client →
 * renderer → repl). primeEdgeContext() is the only effect; everything else
 * derives. Zero ws-server changes — parsedCookies() already reads this.
 */
export class ClientContext extends CliConfigService {
  /**
   * Real edge-derived context, set by primeEdgeContext() before the
   * handshake. Undefined until then — or on fetch failure — in which case
   * the static defaults below remain in effect. Both userMetadata and
   * cookieHeader consult this.
   */
  protected edgeContext?: EdgeClientContext = undefined;

  /**
   * The exact twelve keys the ws-server's parsedCookies() allowlist
   * accepts — anything else in the payload (hostname, ios, isMac) never
   * serializes. Single source: types.ts.
   */
  protected readonly cookieKeys = COOKIE_KEYS;

  /**
   * GET endpoint reflecting x-vercel-* edge-derived client context as JSON
   * (apps/web detectDeviceWorkup). Prod returns real values even for a
   * locally running CLI — the edge derives from the caller's request.
   */
  public get clientContextUrl() {
    return "https://chat.aicoalesce.com/api/client/context" as const;
  }

  /** CLI-authored identity — never taken from the edge payload */
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
   * machine-truth locale — sent as accept-language so the edge derives
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

  protected isEdgeClientContext(v: unknown): v is EdgeClientContext {
    if (typeof v !== "object" || v === null) return false;
    const rec = v as Partial<Record<keyof EdgeClientContext, unknown>>;
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
   * so cookiePairs/edgeToUserMetadata deal in clean values.
   */
  protected normalizeEdgeClientContext(edge: EdgeClientContext) {
    return {
      ...edge,
      city: this.safeDecode(edge.city)
    } satisfies EdgeClientContext;
  }

  /**
   * edge geo + CLI identity + machine tz → the twelve-key record the
   * ws-server allowlist accepts. Identity always wins over edge for
   * ua/browserName/browserVersion/viewport.
   */
  protected cookiePairs(edge: EdgeClientContext, tz = this.localTimezone()) {
    const identity = this.cliIdentity;
    return {
      city: edge.city,
      locale: edge.locale,
      ua: identity.ua,
      ip: edge.ip,
      country: edge.country,
      latlng: edge.latlng,
      tz,
      region: edge.region,
      postalCode: edge.postalCode,
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
   * edge geo → per-message ai_chat_request.metadata (identity fields
   * excluded — ua stays CLI-authored)
   */
  protected edgeToUserMetadata(
    edge: EdgeClientContext,
    tz = this.localTimezone()
  ) {
    const [lat, lng] = [
      Number.parseFloat(edge.latlng.slice(0, edge.latlng.lastIndexOf(","))),
      Number.parseFloat(edge.latlng.slice(edge.latlng.lastIndexOf(",") + 1))
    ];
    return {
      city: edge.city,
      region: edge.region,
      country: edge.country,
      postalCode: edge.postalCode,
      locale: edge.locale,
      ip: edge.ip,
      lat,
      lng,
      tz
    } satisfies UserMetadata;
  }

  /**
   * One GET at startup — primes edgeContext for userMetadata/cookieHeader.
   * Degrades to undefined on any failure (timeout, non-200, malformed
   * payload) so an edge blip never blocks a session; the static defaults
   * stay in effect.
   */
  public async primeEdgeContext(timeoutMs = 3500) {
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
      this.edgeContext = this.isEdgeClientContext(data)
        ? this.normalizeEdgeClientContext(data)
        : undefined;
      return this.edgeContext;
    } catch {
      return undefined;
    }
  }

  /**
   * Static defaults (single-operator, plan §0.1) merged with real
   * edge-derived values once primeEdgeContext() lands — the same metadata
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
      ip: "127.0.0.1"
    } as const satisfies UserMetadata;
    const edge = this.edgeContext;
    return edge
      ? ({ ...base, ...this.edgeToUserMetadata(edge) } satisfies UserMetadata)
      : base;
  }

  /**
   * UserMetadata → the Cookie header parsedCookies() reads at the
   * handshake. Encode-once discipline: the server decodes each value
   * exactly once, so both branches serialize raw values through
   * serializeCookieHeader.
   */
  public get cookieHeader() {
    const edge = this.edgeContext;
    if (edge) {
      return this.serializeCookieHeader(this.cookiePairs(edge));
    }
    const m = this.userMetadata;
    const identity = this.cliIdentity;
    return this.serializeCookieHeader({
      city: m.city,
      region: m.region,
      country: m.country,
      tz: m.tz,
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
