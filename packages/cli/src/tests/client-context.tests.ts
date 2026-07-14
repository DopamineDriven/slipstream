import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ClientContext } from "@/client-context.ts";
import type { CookieKey, EdgeClientContext } from "@/types.ts";
import { COOKIE_KEYS } from "@/types.ts";

/**
 * Replica of the ws-server's parsedCookies() loop (split on ";", k=v regex,
 * decodeURIComponent once per value) — the round-trip oracle for the
 * encode-once discipline.
 */
function parseLikeWsServer(header: string) {
  const out = new Map<string, string>();
  header.split(";").forEach(cookie => {
    const parts = cookie.match(/(.*?)=(.*)/);
    if (parts) {
      const k = (parts[1]?.trim() ?? "").trimStart();
      const v = parts[2]?.trim() ?? "";
      out.set(k, decodeURIComponent(v));
    }
  });
  return out;
}

/** widens the protected surface for the suite — safeDecode/isParseableLatLng stay private, exercised through guard/normalize */
class TestClientContext extends ClientContext {
  public pairs(edge: EdgeClientContext, tz?: string) {
    return tz ? this.cookiePairs(edge, tz) : this.cookiePairs(edge);
  }

  public serialize(pairs: Record<CookieKey, string>) {
    return this.serializeCookieHeader(pairs);
  }

  public guard(v: unknown) {
    return this.isEdgeClientContext(v);
  }

  public normalize(edge: EdgeClientContext) {
    return this.normalizeEdgeClientContext(edge);
  }

  public toMetadata(edge: EdgeClientContext, tz?: string) {
    return tz ? this.edgeToUserMetadata(edge, tz) : this.edgeToUserMetadata(edge);
  }

  public machineTz() {
    return this.localTimezone();
  }
}

const ctx = new TestClientContext();

const edge = {
  hostname: "chat.aicoalesce.com",
  locale: "en-US",
  viewport: "desktop",
  browserName: "Chrome",
  browserVersion: "147.0.7727.49",
  ios: "false",
  latlng: "41.8338486,-87.8966849",
  tz: "America/Chicago",
  ua: "curl%2F7.81.0",
  ip: "203.0.113.7",
  country: "US",
  city: "Barrington",
  isMac: "false",
  region: "Illinois",
  postalCode: "60010"
} as const satisfies EdgeClientContext;

describe("cookiePairs — edge geo + CLI identity, identity wins", () => {
  it("takes geo from the edge and identity from the CLI", () => {
    const pairs = ctx.pairs(edge, "America/Chicago");
    assert.equal(pairs.city, "Barrington");
    assert.equal(pairs.ip, "203.0.113.7");
    assert.equal(pairs.latlng, "41.8338486,-87.8966849");
    assert.equal(pairs.browserName, ctx.cliIdentity.browserName);
    assert.equal(pairs.browserVersion, ctx.cliIdentity.browserVersion);
    assert.equal(pairs.ua, ctx.cliIdentity.ua);
    assert.equal(pairs.viewport, ctx.cliIdentity.viewport);
    assert.notEqual(pairs.browserName, edge.browserName);
  });

  it("defaults tz to the machine timezone, not the edge's IP-geo tz", () => {
    const pairs = ctx.pairs(edge);
    assert.equal(pairs.tz, ctx.machineTz());
  });
});

describe("serializeCookieHeader — encode-once round-trips through the server parse", () => {
  it("server-side decode restores every raw value losslessly", () => {
    const pairs = ctx.pairs(edge, "America/Chicago");
    const parsed = parseLikeWsServer(ctx.serialize(pairs));
    for (const key of COOKIE_KEYS) {
      assert.equal(parsed.get(key), pairs[key], `round-trip failed for ${key}`);
    }
  });

  it("serializes exactly the twelve allowlisted keys — hostname/ios/isMac never leak", () => {
    const parsed = parseLikeWsServer(ctx.serialize(ctx.pairs(edge)));
    assert.equal(parsed.size, COOKIE_KEYS.length);
    assert.equal(parsed.has("hostname"), false);
    assert.equal(parsed.has("ios"), false);
    assert.equal(parsed.has("isMac"), false);
  });

  it("encodes cookie-hostile characters (latlng comma, tz slash, ua spaces)", () => {
    const header = ctx.serialize(ctx.pairs(edge, "America/Chicago"));
    assert.match(header, /latlng=41\.8338486%2C-87\.8966849/);
    assert.match(header, /tz=America%2FChicago/);
    assert.doesNotMatch(header, / \(wsl2; node\)/);
  });
});

describe("isEdgeClientContext — payload guard", () => {
  it("accepts the endpoint-shaped payload", () => {
    assert.equal(ctx.guard(edge), true);
  });

  it("rejects null, primitives, and missing fields", () => {
    assert.equal(ctx.guard(null), false);
    assert.equal(ctx.guard(42), false);
    assert.equal(ctx.guard("{}"), false);
    const { city: _city, ...missingCity } = edge;
    assert.equal(ctx.guard(missingCity), false);
  });

  it("rejects non-string fields and unparseable latlng", () => {
    assert.equal(ctx.guard({ ...edge, ip: 7 }), false);
    assert.equal(ctx.guard({ ...edge, latlng: "not-coords" }), false);
    assert.equal(ctx.guard({ ...edge, latlng: "1,2,3" }), false);
  });
});

describe("normalizeEdgeClientContext — Vercel's URI-encoded city decoded at the boundary", () => {
  it("decodes an encoded city and leaves everything else untouched", () => {
    const normalized = ctx.normalize({ ...edge, city: "Oak%20Ridge" });
    assert.equal(normalized.city, "Oak Ridge");
    assert.equal(normalized.latlng, edge.latlng);
    assert.equal(normalized.ua, edge.ua);
  });

  it("a malformed percent-sequence passes through rather than throwing", () => {
    const normalized = ctx.normalize({ ...edge, city: "%E0%A4%A" });
    assert.equal(normalized.city, "%E0%A4%A");
  });
});

describe("edgeToUserMetadata — per-message metadata from edge geo", () => {
  it("parses latlng into numeric lat/lng and honors the tz param", () => {
    const meta = ctx.toMetadata(edge, "America/Chicago");
    assert.equal(meta.lat, 41.8338486);
    assert.equal(meta.lng, -87.8966849);
    assert.equal(meta.tz, "America/Chicago");
    assert.equal(meta.city, "Barrington");
    assert.equal(meta.ip, "203.0.113.7");
  });

  it("excludes identity-owned fields — ua stays CLI-authored", () => {
    const meta = ctx.toMetadata(edge);
    assert.equal("ua" in meta, false);
    assert.equal("browserName" in meta, false);
    assert.equal("viewport" in meta, false);
  });
});

describe("cookieHeader — static fallback before primeEdgeContext lands", () => {
  it("serializes the Barrington defaults with CLI identity when no edge context is set", () => {
    const parsed = parseLikeWsServer(ctx.cookieHeader);
    assert.equal(parsed.get("city"), "Barrington");
    assert.equal(parsed.get("browserName"), ctx.cliIdentity.browserName);
    assert.equal(parsed.get("ua"), ctx.cliIdentity.ua);
    assert.equal(parsed.size, COOKIE_KEYS.length);
  });
});
