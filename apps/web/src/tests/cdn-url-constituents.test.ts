import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCdnUrlBase,
  isImage,
  toCdnUrlConstituents,
  userCdnUrlConstituents
} from "@/lib/helpers";
import devUrls from "./__fixtures__/dev/att-urls.json" with { type: "json" };
import prodUrls from "./__fixtures__/prod/att-urls.json" with { type: "json" };

/**
 * Every url the CDN has ever served, pulled straight from the Attachment
 * table (ws-server `src/test/bulk-attachments.ts`). The parsers are exercised
 * against all of them; the contract asserted is "the constituents rebuild the
 * url", which is the only property that proves nothing was sliced off-by-one.
 */
const FIXTURES = {
  dev: { host: getCdnUrlBase("abc123"), urls: devUrls },
  prod: { host: getCdnUrlBase(undefined), urls: prodUrls }
} as const;

/** the series-id shapes the generated lanes mint today */
const CUID2 = /^[a-z0-9]{24}$/;
const OPENAI_FACILITATOR = /^ig_[a-f0-9]{50}$/;
const NANOID = /^[A-Za-z0-9_-]{21}$/;

/** `<ms>-<seriesId>-<ordinal>.<ext>` — the current generated anatomy */
const GENERATED_BASENAME = /^(\d{13})-(.+)-(\d+)\.([A-Za-z0-9]+)$/;
/** `<ms>-<filename>.<ext>` — an ALIASED user asset (filename may hold dots and dashes) */
const ALIASED_BASENAME = /^(\d{13})-(.+)\.([A-Za-z0-9]+)$/;
/** `att_<attachmentId>.<ext>` — an ACTIVE (compat-converted) user asset */
const ACTIVE_BASENAME = /^att_([a-z0-9]+)\.([A-Za-z0-9]+)$/;

function segments(url: string) {
  const { pathname } = new URL(url);
  // `/<origin>/<userId | converted>/<basename>` — defaults keep the tuple
  // members `string` under noUncheckedIndexedAccess; a short path fails the
  // host/shape assertions downstream rather than throwing here
  const [, origin = "", second = "", basename = ""] = pathname.split("/");
  return { origin, second, basename } as const;
}

function isCurrentSeriesId(sId: string) {
  return CUID2.test(sId) || OPENAI_FACILITATOR.test(sId) || NANOID.test(sId);
}

describe("getCdnUrlBase", () => {
  it("IS_PROD is a LOCAL marker: set → the dev host, unset → the prod host", () => {
    assert.equal(getCdnUrlBase("abc123"), FIXTURES.dev.host);
    assert.equal(getCdnUrlBase(undefined), FIXTURES.prod.host);
  });
});

for (const [env, { host, urls }] of Object.entries(FIXTURES)) {
  describe(`${env} fixture — ${urls.length} urls on ${host}`, () => {
    const generated = urls.filter(u => segments(u).origin === "generated");
    const user = urls.filter(u => {
      const { origin } = segments(u);
      return origin === "upload" || origin === "pasted";
    });

    it("every url is either generated or a user asset, on this env's host", () => {
      assert.equal(generated.length + user.length, urls.length);
      for (const u of urls) assert.ok(u.startsWith(`${host}/`), u);
    });

    describe("toCdnUrlConstituents — generated assets", () => {
      const current = generated.filter(u => {
        const m = GENERATED_BASENAME.exec(segments(u).basename);
        return typeof m?.[2] !== "undefined" && isCurrentSeriesId(m[2]);
      });
      const legacy = generated.filter(u => !current.includes(u));

      it(`rebuilds every current-anatomy url from its constituents (${current.length})`, t => {
        const failures = Array.of<string>();
        const byType = { InlineImageGenOutput: 0, ImageGenOutput: 0 };

        for (const u of current) {
          const { second: userId, basename } = segments(u);
          const m = GENERATED_BASENAME.exec(basename);
          if (!m?.[1] || !m?.[2] || !m?.[3] || !m?.[4]) {
            failures.push(`${u}\n    basename did not match the anatomy`);
            continue;
          }
          const [, ms, sId, ordinal, urlExt] = m;
          const c = toCdnUrlConstituents(u);
          byType[c.type] += 1;

          // assetOrigin ("generated") and compatStatus ("ALIASED") are literal
          // in the return type — the guard throws for anything else (tested
          // below), so there is nothing to compare; the rebuilt url covers them
          const rebuilt = `${host}/${c.assetOrigin}/${c.userId}/${c.timestampMs}-${c.sId}-${c.sOrdinal}.${urlExt}`;
          const problems = Array.of<string>();
          if (rebuilt !== u) problems.push(`rebuilt ${rebuilt}`);
          if (c.userId !== userId) problems.push(`userId ${c.userId} ≠ ${userId}`);
          if (c.timestampMs !== Number.parseInt(ms, 10)) problems.push(`timestampMs ${c.timestampMs}`);
          if (c.sId !== sId) problems.push(`sId ${c.sId} ≠ ${sId}`);
          if (c.sOrdinal !== Number.parseInt(ordinal, 10)) problems.push(`sOrdinal ${c.sOrdinal}`);
          if (c.type !== (CUID2.test(sId) ? "InlineImageGenOutput" : "ImageGenOutput"))
            problems.push(`type ${c.type} for ${sId}`);
          // images keep their extension; anything else is reported as pdf by contract
          const expectedExt = isImage(urlExt) ? urlExt : "pdf";
          if (c.ext !== expectedExt) problems.push(`ext ${c.ext} ≠ ${expectedExt}`);
          if (c.assetType !== (isImage(urlExt) ? "IMAGE" : "DOCUMENT"))
            problems.push(`assetType ${c.assetType}`);
          if (problems.length > 0) failures.push(`${u}\n    ${problems.join(" · ")}`);
        }

        t.diagnostic(`${env}: ${byType.InlineImageGenOutput} inline (cuid2) · ${byType.ImageGenOutput} job (ig_ / nanoid)`);
        assert.equal(failures.length, 0, `${failures.length} failures:\n${failures.slice(0, 8).join("\n")}`);
      });

      it(`census: legacy generated urls without a series ordinal (${legacy.length}) — not a contract`, t => {
        // `<ms>-<id>.<ext>` with no `-<ordinal>`: audio-gen / TTS outputs and
        // pre-series image outputs (cuid2, nanoid, resp_-prefixed response ids).
        // toCdnUrlConstituents assumes the ordinal exists, so on these it slices
        // the id's last char into sOrdinal. Counted here so the population is
        // visible; a lane that needs them parsed gets its own parser.
        const shapes = new Map<string, number>();
        for (const u of legacy) {
          const { basename } = segments(u);
          const ext = basename.slice(basename.lastIndexOf(".") + 1);
          const stem = basename.slice(14, basename.lastIndexOf("."));
          const shape = CUID2.test(stem)
            ? "cuid2"
            : NANOID.test(stem)
              ? "nanoid"
              : stem.startsWith("resp_")
                ? "resp_"
                : `other(${stem.length})`;
          const key = `${shape}.${ext}`;
          shapes.set(key, (shapes.get(key) ?? 0) + 1);
          // slicing never throws; the census only proves that
          assert.doesNotThrow(() => toCdnUrlConstituents(u));
        }
        for (const [shape, count] of [...shapes].sort((a, b) => b[1] - a[1])) {
          t.diagnostic(`${env}: ${count} × ${shape}`);
        }
      });

      it("refuses a user asset url (the assetOrigin guard)", () => {
        const sample = user[0];
        assert.ok(sample, "fixture has at least one user asset");
        assert.throws(() => toCdnUrlConstituents(sample), /generated/);
      });
    });

    describe("userCdnUrlConstituents — user assets", () => {
      const active = user.filter(u => segments(u).second === "converted");
      const aliased = user.filter(u => segments(u).second !== "converted");

      it(`rebuilds every ACTIVE (compat-converted) url (${active.length})`, t => {
        const failures = Array.of<string>();
        const byOrigin = { upload: 0, pasted: 0 };
        for (const u of active) {
          const { origin, basename } = segments(u);
          const m = ACTIVE_BASENAME.exec(basename);
          if (!m?.[1] || !m?.[2]) {
            failures.push(`${u}\n    basename did not match att_<id>.<ext>`);
            continue;
          }
          const [, attachmentId, urlExt] = m;
          const c = userCdnUrlConstituents(u);
          const problems = Array.of<string>();
          if (c.compatStatus !== "ACTIVE") {
            problems.push(`compatStatus ${c.compatStatus}`);
          } else {
            byOrigin[c.assetOrigin] += 1;
            if (c.assetOrigin !== origin) problems.push(`assetOrigin ${c.assetOrigin} ≠ ${origin}`);
            if (c.attachmentId !== attachmentId) problems.push(`attachmentId ${c.attachmentId}`);
            if (c.filename !== `att_${attachmentId}`) problems.push(`filename ${c.filename}`);
            const expectedExt = isImage(urlExt) ? urlExt : "pdf";
            if (c.ext !== expectedExt) problems.push(`ext ${c.ext} ≠ ${expectedExt}`);
            if (c.assetType !== (isImage(urlExt) ? "IMAGE" : "DOCUMENT")) problems.push(`assetType ${c.assetType}`);
            const rebuilt = `${host}/${c.assetOrigin}/converted/att_${c.attachmentId}.${urlExt}`;
            if (rebuilt !== u) problems.push(`rebuilt ${rebuilt}`);
          }
          if (problems.length > 0) failures.push(`${u}\n    ${problems.join(" · ")}`);
        }
        t.diagnostic(`${env}: ${byOrigin.upload} upload · ${byOrigin.pasted} pasted (ACTIVE)`);
        assert.equal(failures.length, 0, `${failures.length} failures:\n${failures.slice(0, 8).join("\n")}`);
      });

      it(`rebuilds every ALIASED (original) url (${aliased.length})`, t => {
        const failures = Array.of<string>();
        const byExt = new Map<string, number>();
        for (const u of aliased) {
          const { origin, second: userId, basename } = segments(u);
          const m = ALIASED_BASENAME.exec(basename);
          if (!m?.[1] || !m?.[2] || !m?.[3]) {
            failures.push(`${u}\n    basename did not match <ms>-<filename>.<ext>`);
            continue;
          }
          const [, ms, filename, urlExt] = m;
          byExt.set(urlExt, (byExt.get(urlExt) ?? 0) + 1);
          const c = userCdnUrlConstituents(u);
          const problems = Array.of<string>();
          if (c.compatStatus !== "ALIASED") {
            problems.push(`compatStatus ${c.compatStatus}`);
          } else {
            if (c.assetOrigin !== origin) problems.push(`assetOrigin ${c.assetOrigin} ≠ ${origin}`);
            if (c.userId !== userId) problems.push(`userId ${c.userId} ≠ ${userId}`);
            if (c.timestampMs !== Number.parseInt(ms, 10)) problems.push(`timestampMs ${c.timestampMs}`);
            if (c.filename !== filename) problems.push(`filename ${c.filename} ≠ ${filename}`);
            const expectedExt = isImage(urlExt) ? urlExt : "pdf";
            if (c.ext !== expectedExt) problems.push(`ext ${c.ext} ≠ ${expectedExt}`);
            if (c.assetType !== (isImage(urlExt) ? "IMAGE" : "DOCUMENT")) problems.push(`assetType ${c.assetType}`);
            const rebuilt = `${host}/${c.assetOrigin}/${c.userId}/${c.timestampMs}-${c.filename}.${urlExt}`;
            if (rebuilt !== u) problems.push(`rebuilt ${rebuilt}`);
          }
          if (problems.length > 0) failures.push(`${u}\n    ${problems.join(" · ")}`);
        }
        t.diagnostic(
          `${env}: ALIASED extensions → ${[...byExt]
            .sort((a, b) => b[1] - a[1])
            .map(([e, n]) => `${e}:${n}`)
            .join(" ")}`
        );
        assert.equal(failures.length, 0, `${failures.length} failures:\n${failures.slice(0, 8).join("\n")}`);
      });
    });
  });
}
