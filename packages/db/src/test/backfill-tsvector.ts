import * as dotenv from "dotenv";
import pg from "pg";

dotenv.config({ quiet: true });

/**
 * Backfill `contentTsv` for all existing UserStoreDocChunk rows.
 *
 * Strips null bytes from content before calling to_tsvector (PG rejects \0 in text).
 * Processes in batches to avoid long-running transactions.
 *
 * Usage:
 *   pnpm tsx src/test/backfill-tsvector.ts --env dev
 *   pnpm tsx src/test/backfill-tsvector.ts --env prod --size 500
 *   pnpm tsx src/test/backfill-tsvector.ts --env dev --size 200 --dry true
 */

const BATCH_SIZE_DEFAULT = 200;

async function resolveDbUrl(target: "dev" | "prod") {
  if (target === "dev" && process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  } else {
    const { Credentials } = await import("@slipstream/credentials");
    const cred = new Credentials();
    return await cred.get("DATABASE_URL");
  }
}

async function backfill(
  target: "dev" | "prod",
  batchSize = BATCH_SIZE_DEFAULT,
  dryRun = false
) {
  const connectionString = await resolveDbUrl(target);

  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM "UserStoreDocChunk" WHERE "contentTsv" IS NULL AND content IS NOT NULL`
    );
    const totalRows = Number.parseInt(countResult.rows[0]?.count ?? "0", 10);

    console.log(`Found ${totalRows} chunks needing tsvector backfill`);

    if (totalRows === 0) {
      console.log(
        "Nothing to backfill — all chunks already have contentTsv populated"
      );
      return;
    }

    if (dryRun) {
      console.log(
        `[dry-run] Would process ${totalRows} rows in batches of ${batchSize}`
      );
      return;
    }

    let processed = 0;
    let errors = 0;

    while (processed < totalRows) {
      // 1. Fetch batch of rows with their content into Node
      const batch = await client.query<{ id: string; content: string }>(
        `SELECT id, content FROM "UserStoreDocChunk"
         WHERE "contentTsv" IS NULL AND content IS NOT NULL
         LIMIT $1`,
        [batchSize]
      );

      if (batch.rows.length === 0) break;

      // 2. Clean content in Node, update one row at a time
      for (const row of batch.rows) {
        const cleaned = row.content.replace(/\0/g, "");
        try {
          await client.query(
            `UPDATE "UserStoreDocChunk"
             SET "contentTsv" = to_tsvector('english', $1)
             WHERE id = $2`,
            [cleaned, row.id]
          );
        } catch (err) {
          errors += 1;
          console.warn(
            `Failed to backfill chunk ${row.id}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      processed += batch.rows.length;
      console.log(
        `Backfilled ${processed}/${totalRows} chunks${errors > 0 ? ` (${errors} errors)` : ""}`
      );
    }

    const verifyResult = await client.query<{ remaining: string }>(
      `SELECT COUNT(*) as remaining FROM "UserStoreDocChunk" WHERE "contentTsv" IS NULL AND content IS NOT NULL`
    );
    const remaining = Number.parseInt(
      verifyResult.rows[0]?.remaining ?? "0",
      10
    );

    if (remaining === 0) {
      console.log(`Backfill complete: ${processed} chunks updated`);
    } else {
      console.warn(
        `Backfill finished but ${remaining} chunks still have NULL contentTsv`
      );
    }
  } finally {
    await client.end();
  }
}

if (process.argv[3] === "dev" || process.argv[3] === "prod") {
  let size: number;
  if (process.argv[5]) {
    size = Number.parseInt(process.argv[5], 10);
  } else {
    size = BATCH_SIZE_DEFAULT;
  }

  const batchSize =
    Number.isFinite(size) && size > 0 ? size : BATCH_SIZE_DEFAULT;

  const dryRun = process.argv[7] === "true";

  backfill(process.argv[3], batchSize, dryRun).catch(err => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
}

/**
 * pnpm tsx src/test/backfill-tsvector.ts --env dev
 */
