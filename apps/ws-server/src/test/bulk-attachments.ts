import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import type { $Enums } from "@slipstream/db/node/generated/client";

dotenv.config({ quiet: true });

interface AttachmentUrlRow {
  cdnUrl: string | null;
  compatCdnUrl: string | null;
  /**
   * ACTIVE  → the compat pipeline re-encoded the asset; cdnUrl and compatCdnUrl
   *           differ and compatCdnUrl is the servable one
   * ALIASED → one object; both columns carry the same url
   */
  compatStatus: $Enums.CompatStatus | null;
  sourceUrl: string | null;
  publicUrl: string | null;
}

const CDN_HOST = {
  dev: "https://assets-dev.aicoalesce.com",
  prod: "https://assets.aicoalesce.com"
} as const;

const data = async (target: "dev" | "prod" = "dev") => {
  let connectionString: string;
  if (target === "dev") {
    const secret = process.env.DATABASE_URL;
    if (!secret) throw new Error("no dev env var set for DIRECT_URL");
    connectionString = secret;
  } else {
    const { Credentials } = await import("@slipstream/credentials");
    const p = new Credentials();
    connectionString = await p.get("DATABASE_URL");
  }
  const { Client } = await import("pg");
  const c = new Client(connectionString);
  await c.connect();
  try {
    const { rows } = await c.query<AttachmentUrlRow>(
      `
    SELECT
      a."cdnUrl",
      a."compatCdnUrl",
      a."compatStatus",
      a."publicUrl",
      a."sourceUrl"
    FROM "Attachment" a
    WHERE a."cdnUrl" IS NOT NULL
       OR a."compatCdnUrl" IS NOT NULL
    ORDER BY a."createdAt" DESC
    LIMIT $1::int
    `,
      [10]
    );

    const urls = Array.of<string>();
    const urlsInspect = Array.of<{url: string; publicUrl: string|null; sourceUrl: string|null;}>();
    for (const {
      cdnUrl,
      compatCdnUrl,
      compatStatus,
      publicUrl,
      sourceUrl
    } of rows) {
      const url =
        compatStatus === "ACTIVE" && compatCdnUrl
          ? compatCdnUrl
          : (cdnUrl ?? compatCdnUrl);
      if (!url) throw new Error("no cdnUrl associated with asset");
      urlsInspect.push({ url, publicUrl, sourceUrl });
      urls.push(url);
    }
    console.log(urlsInspect);

    // rows written under the other environment's host get re-pointed at this
    // one; the path is the asset's identity, the host is the environment
    const host = CDN_HOST[target];
    return urls.map(u => {
      if (u.startsWith(host)) return u;
      const { pathname } = new URL(u);
      console.log([u]);

      return `${host}${pathname}`;
    });
  } catch (err) {
    console.error(err);
    throw new Error(
      typeof err === "string"
        ? err
        : err instanceof Error
          ? err.message
          : "there was a problem in bulk-attachments test query..."
    );
  } finally {
    await c.end();
  }
};

interface AttachmentHostRow {
  id: string;
  cdnUrl: string | null;
  compatCdnUrl: string | null;
  publicUrl: string | null;
  compatStatus: $Enums.CompatStatus | null;
  origin: $Enums.AssetOrigin;
}

interface HostRewrite {
  id: string;
  column: "cdnUrl" | "compatCdnUrl";
  compatStatus: $Enums.CompatStatus | null;
  origin: $Enums.AssetOrigin;
  from: string;
  to: string;
  /** HEAD status of `to` through the CDN — a report, not a gate: every row is rewritten */
  head: number;
  /** the S3 url column as persisted — if it carries the CDN host, the two columns were crossed at write time */
  publicUrl: string | null;
  swapped: boolean;
}

/**
 * One-off: every cdnUrl / compatCdnUrl not on this environment's CDN host is
 * re-pointed at it — the old d0paminedriven.com aliases, the raw
 * ws-server-assets-* bucket hosts (the origin behind the CDN, same key), and
 * the expired presigned GETs (query string dropped). The path is the asset's
 * identity; only the host changes. ALL of them are rewritten: the invariant
 * is "cdnUrl is on the CDN host", whether or not the object exists. The HEAD
 * per rewrite is recorded so a row whose object was never uploaded (an
 * abandoned REQUESTED paste) is visible in the report. Dry-run unless `apply`
 * is passed. Idempotent — a second run finds nothing.
 */
const normalizeHosts = async (target: "dev" | "prod", apply: boolean) => {
  let connectionString: string;
  if (target === "dev") {
    const secret = process.env.DATABASE_URL;
    if (!secret) throw new Error("no dev env var set for DATABASE_URL");
    connectionString = secret;
  } else {
    const { Credentials } = await import("@slipstream/credentials");
    const p = new Credentials();
    connectionString = await p.get("DATABASE_URL");
  }
  const host = CDN_HOST[target];
  const { Client } = await import("pg");
  const c = new Client(connectionString);
  await c.connect();
  try {
    const { rows } = await c.query<AttachmentHostRow>(
      `
    SELECT a."id", a."cdnUrl", a."compatCdnUrl", a."publicUrl", a."compatStatus", a."origin"
    FROM "Attachment" a
    WHERE (a."cdnUrl" IS NOT NULL AND a."cdnUrl" NOT LIKE $1)
       OR (a."compatCdnUrl" IS NOT NULL AND a."compatCdnUrl" NOT LIKE $1)
    ORDER BY a."createdAt" DESC
    `,
      [`${host}/%`]
    );

    // ALIASED: cdnUrl and compatCdnUrl are the same object and must stay
    //          identical — both columns move together
    // ACTIVE:  compatCdnUrl is the servable (converted) object and is the one
    //          that matters; cdnUrl (the original) moves too for the invariant
    const rewrites = Array.of<HostRewrite>();
    const aliasedDrift = Array.of<{ id: string; cdnUrl: string | null; compatCdnUrl: string | null }>();
    for (const row of rows) {
      const after = { cdnUrl: row.cdnUrl, compatCdnUrl: row.compatCdnUrl };
      for (const column of ["cdnUrl", "compatCdnUrl"] as const) {
        const from = row[column];
        if (!from || from.startsWith(`${host}/`)) continue;
        const to = `${host}${new URL(from).pathname}`;
        after[column] = to;
        const res = await fetch(to, { method: "HEAD" });
        rewrites.push({
          id: row.id,
          column,
          compatStatus: row.compatStatus,
          origin: row.origin,
          from,
          to,
          head: res.status,
          publicUrl: row.publicUrl,
          swapped: row.publicUrl?.startsWith(`${host}/`) ?? false
        } satisfies HostRewrite);
      }
      if (row.compatStatus === "ALIASED" && after.cdnUrl !== after.compatCdnUrl) {
        aliasedDrift.push({ id: row.id, ...after });
      }
    }

    const activeCompat = rewrites.filter(
      r => r.compatStatus === "ACTIVE" && r.column === "compatCdnUrl"
    );
    // reachability is judged on the column that is displayed: compatCdnUrl
    // for a transformed (ACTIVE) row, cdnUrl otherwise. An ACTIVE row's
    // original is never shown, so its HEAD is not worth a line.
    const unreachable = rewrites.filter(
      r =>
        r.head !== 200 &&
        r.column === (r.compatStatus === "ACTIVE" ? "compatCdnUrl" : "cdnUrl")
    );
    console.log(
      `${target}: ${rows.length} rows off-host · ${rewrites.length} column rewrites (${activeCompat.length} ACTIVE compatCdnUrl) · ${unreachable.length} whose DISPLAYED url does not answer through the CDN (rewritten anyway)`
    );
    for (const r of unreachable) {
      console.log(
        `  ${r.head} ${r.compatStatus ?? "no-compat"}/${r.origin} ${r.id} ${r.column}\n    ${r.column.padEnd(12)} ${r.from}\n    publicUrl    ${r.publicUrl ?? "null"}${r.swapped ? "   ← CDN host in publicUrl: columns crossed at persistence" : ""}`
      );
    }
    const crossed = rewrites.filter(r => r.swapped);
    if (crossed.length > 0) {
      console.log(
        `${target}: ${crossed.length} rewrites where publicUrl carries the CDN host (cdnUrl/publicUrl crossed at write time)`
      );
    }
    for (const d of aliasedDrift) {
      console.log(
        `  ALIASED pair differs after rewrite — ${d.id}\n    cdnUrl       ${d.cdnUrl}\n    compatCdnUrl ${d.compatCdnUrl}`
      );
    }

    if (apply && rewrites.length > 0) {
      await c.query("BEGIN");
      try {
        for (const r of rewrites) {
          await c.query(
            r.column === "cdnUrl"
              ? `UPDATE "Attachment" SET "cdnUrl" = $1 WHERE "id" = $2 AND "cdnUrl" = $3`
              : `UPDATE "Attachment" SET "compatCdnUrl" = $1 WHERE "id" = $2 AND "compatCdnUrl" = $3`,
            [r.to, r.id, r.from]
          );
        }
        await c.query("COMMIT");
        console.log(`${target}: ${rewrites.length} columns rewritten`);
      } catch (err) {
        await c.query("ROLLBACK");
        throw err;
      }
    } else if (!apply) {
      console.log(`${target}: dry run — pass \`apply\` as the next argument to write`);
    }

    return { target, apply, rewrites, aliasedDrift };
  } finally {
    await c.end();
  }
};

if (process.argv[3] === "dev" || process.argv[3] === "prod") {
  const fs = new Fs(process.cwd());
  (async (argv3: "dev" | "prod") => {
    return await data(argv3);
  })(process.argv[3]).then(v => {
    fs.withWs(
      `src/test/__out__/inspect/${process.argv[3]}/att-inspect.json`,
      JSON.stringify(v, null, 2)
    );
  });
}

interface OrphanRow {
  id: string;
  status: $Enums.AssetStatus;
  origin: $Enums.AssetOrigin;
  compatStatus: $Enums.CompatStatus | null;
  createdAt: string;
  bucket: string;
  key: string;
  cdnUrl: string | null;
  publicUrl: string | null;
}

/**
 * An attachment is coupled to its message at send (batchId join). One that
 * still has no messageId after the presigned upload window (7 days) can never
 * be sent: the PUT url has expired and the compose that created it is gone.
 * Scoped to compatStatus IS NULL as well — finalize never ran, so nothing
 * downstream (conversion, store docs, tts) can have touched the row. Every
 * child relation on Attachment cascades
 * (metadata, lineage, tts, store docs, provider files), so one DELETE takes
 * the whole subtree. READY rows are excluded outright: a finished upload has
 * an object in the bucket and is not this sweep's to remove. Dry-run unless
 * `apply` is passed.
 */
const ORPHAN_AGE_DAYS = 7;
/** rows older than this predate the compat column and the finalize rewrite — legacy, not orphans */
const ORPHAN_FLOOR = "2025-09-01";
const deleteOrphans = async (target: "dev" | "prod", apply: boolean) => {
  let connectionString: string;
  if (target === "dev") {
    const secret = process.env.DATABASE_URL;
    if (!secret) throw new Error("no dev env var set for DATABASE_URL");
    connectionString = secret;
  } else {
    const { Credentials } = await import("@slipstream/credentials");
    const p = new Credentials();
    connectionString = await p.get("DATABASE_URL");
  }
  const { Client } = await import("pg");
  const c = new Client(connectionString);
  await c.connect();
  try {
    const { rows } = await c.query<OrphanRow>(
      `
    SELECT a."id", a."status", a."origin", a."compatStatus",
           to_char(a."createdAt", 'YYYY-MM-DD') AS "createdAt",
           a."bucket", a."key", a."cdnUrl", a."publicUrl"
    FROM "Attachment" a
    WHERE a."messageId" IS NULL
      AND a."compatStatus" IS NULL
      AND a."createdAt" > $2::date
      AND a."createdAt" < now() - make_interval(days => $1::int)
      AND a."status" <> 'READY'
    ORDER BY a."createdAt" DESC
    `,
      [ORPHAN_AGE_DAYS, ORPHAN_FLOOR]
    );

    console.log(
      `${target}: ${rows.length} orphans (no messageId, no compatStatus, not READY, after ${ORPHAN_FLOOR}, older than ${ORPHAN_AGE_DAYS} days)`
    );
    for (const r of rows) {
      console.log(
        `  ${r.createdAt} ${r.status}/${r.origin}/${r.compatStatus ?? "no-compat"} ${r.id}  s3://${r.bucket}/${r.key}`
      );
    }

    let deleted = 0;
    if (apply && rows.length > 0) {
      await c.query("BEGIN");
      try {
        const res = await c.query(
          `DELETE FROM "Attachment"
           WHERE "id" = ANY($1::text[])
             AND "messageId" IS NULL
             AND "compatStatus" IS NULL
             AND "createdAt" > $2::date
             AND "status" <> 'READY'`,
          [rows.map(r => r.id), ORPHAN_FLOOR]
        );
        deleted = res.rowCount ?? 0;
        await c.query("COMMIT");
        console.log(`${target}: ${deleted} orphan rows deleted (children cascaded)`);
      } catch (err) {
        await c.query("ROLLBACK");
        throw err;
      }
    } else if (!apply) {
      console.log(`${target}: dry run — pass \`apply\` as the next argument to delete`);
    }

    return { target, apply, ageDays: ORPHAN_AGE_DAYS, deleted, orphans: rows };
  } finally {
    await c.end();
  }
};

if (
  process.argv[3] === "delete-orphans-dev" ||
  process.argv[3] === "delete-orphans-prod"
) {
  const fs = new Fs(process.cwd());
  const target = process.argv[3] === "delete-orphans-dev" ? "dev" : "prod";
  const apply = process.argv[4] === "apply";
  deleteOrphans(target, apply).then(v => {
    fs.withWs(
      `src/test/__out__/inspect/${target}/att-orphans${apply ? "-deleted" : ""}.json`,
      JSON.stringify(v, null, 2)
    );
  });
}

if (process.argv[3] === "update-dev" || process.argv[3] === "update-prod") {
  const fs = new Fs(process.cwd());
  const target = process.argv[3] === "update-dev" ? "dev" : "prod";
  const apply = process.argv[4] === "apply";
  normalizeHosts(target, apply).then(v => {
    fs.withWs(
      `src/test/__out__/inspect/${target}/att-normalize${apply ? "-applied" : ""}.json`,
      JSON.stringify(v, null, 2)
    );
  });
}

if (process.argv[3] === "test") {
  (async () => {
    return await fetch(
      "https://assets-dev.d0paminedriven.com/upload/nrr6h4r4480f6kviycyo1zhf/1756699067024-impossible-star.jpg"
    );
  })().then(res => {
    console.log({ status: res.status, statusText: res.statusText });
  });
}
