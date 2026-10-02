import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import pg from "pg";

dotenv.config({ quiet: true });

type BackfillTarget = "dev" | "prod";

interface AudioGenOutputRow {
  id: string;
  attachmentId: string;
  /** AudioGenJob.model — lyria is pure, so this is both the facilitator and the generator */
  model: string;
  provider: string;
  /** the AI message the attachment hangs on; its content IS the lyric sheet for a lyria turn */
  messageId: string | null;
  contentHead: string | null;
  needsModels: boolean;
  needsContent: boolean;
}

/**
 * Fills the four lineage columns on AudioGenOutput — generatingModel,
 * facilitatingModel, provider, content — for rows persisted before they
 * existed. No resolver: lyria has never had a facilitator distinct from the
 * generator, so both model columns copy AudioGenJob.model and provider copies
 * AudioGenJob.provider; content copies the AI message's text, which for a
 * lyria turn is the lyric sheet and nothing else. Both updates are set-based
 * joins guarded on IS NULL, so the script is safe to rerun.
 */
class BackfillAudioGenModelsWorkup {
  constructor(protected fs: Fs) {}

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
    } else return String(err);
  }

  private async resolveDbUrl(target: BackfillTarget) {
    if (target === "dev") {
      if (process.env.DATABASE_URL) {
        return process.env.DATABASE_URL;
      } else {
        throw new Error("dev DATABASE_URL secret not found");
      }
    } else {
      const { Credentials } = await import("@slipstream/credentials");
      const cred = new Credentials();
      return await cred.get("DATABASE_URL");
    }
  }

  /** read-only: every output with what the two joins would write, for review */
  public async genRows(target: BackfillTarget) {
    const connectionString = await this.resolveDbUrl(target);

    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }

    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
      // prettier-ignore
      const result = await client.query<AudioGenOutputRow>(
        `SELECT o."id",
                o."attachmentId",
                j."model",
                j."provider",
                a."messageId",
                left(m."content", 60) AS "contentHead",
                (o."generatingModel" IS NULL OR o."facilitatingModel" IS NULL OR o."provider" IS NULL) AS "needsModels",
                (o."content" IS NULL) AS "needsContent"
         FROM "AudioGenOutput" o
         JOIN "AudioGenJob" j ON j."id" = o."jobId"
         JOIN "Attachment" a ON a."id" = o."attachmentId"
         LEFT JOIN "Message" m ON m."id" = a."messageId" AND m."senderType" = 'AI'
         ORDER BY a."createdAt" ASC`
      );

      if (result.rows.length === 0) {
        console.log("No audio gen outputs found");
      }

      const tally = new Map<string, number>();
      for (const r of result.rows) {
        const key = `${r.provider} · ${r.model} · models:${r.needsModels ? "fill" : "set"} · content:${r.needsContent ? (r.contentHead ? "fill" : "NO MESSAGE TEXT") : "set"}`;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
      for (const [key, count] of tally) console.log(`${count}\t${key}`);

      this.fs.withWs(
        `src/test/__out__/backfill/audiogen-models/${target}/rows.json`,
        JSON.stringify(result.rows, null, 2)
      );
      return result.rows;
    } catch (err) {
      throw new Error(this.safeErrMsg(err));
    } finally {
      await client.end();
    }
  }

  public async backfill(target: BackfillTarget) {
    const connectionString = await this.resolveDbUrl(target);
    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }

    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
      await client.query("BEGIN");
      // prettier-ignore
      const models = await client.query(
        `UPDATE "AudioGenOutput" o
         SET "generatingModel" = j."model",
             "facilitatingModel" = j."model",
             "provider" = j."provider"
         FROM "AudioGenJob" j
         WHERE j."id" = o."jobId"
           AND o."generatingModel" IS NULL
           AND o."facilitatingModel" IS NULL
           AND o."provider" IS NULL`
      );
      // prettier-ignore
      const content = await client.query(
        `UPDATE "AudioGenOutput" o
         SET "content" = m."content"
         FROM "Attachment" a
         JOIN "Message" m ON m."id" = a."messageId"
         WHERE a."id" = o."attachmentId"
           AND o."content" IS NULL
           AND m."senderType" = 'AI'
           AND length(m."content") > 0`
      );
      await client.query("COMMIT");
      console.log(
        `${target}: models written on ${models.rowCount ?? 0} rows, content on ${content.rowCount ?? 0} rows`
      );
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(this.safeErrMsg(err));
    } finally {
      await client.end();
    }
  }

  public async exe(target: BackfillTarget) {
    const rows = await this.genRows(target);
    const t0 = performance.now();
    if (rows.length > 0) {
      await this.backfill(target);
    }
    const t1 = performance.now();
    console.log(
      `took ${t1 - t0}ms to backfill lineage across ${rows.length} ${target} audio gen outputs`
    );
  }

  public async crossCheck(target: BackfillTarget) {
    const connectionString = await this.resolveDbUrl(target);
    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }

    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      // prettier-ignore
      const test = await client.query<{ models: number; content: number }>(
        `SELECT count(*) FILTER (WHERE "generatingModel" IS NULL OR "facilitatingModel" IS NULL OR "provider" IS NULL)::int AS "models",
                count(*) FILTER (WHERE "content" IS NULL)::int AS "content"
         FROM "AudioGenOutput"`
      );
      const [row] = test.rows;
      if (!row || (row.models === 0 && row.content === 0)) {
        console.log(`no remaining rows for ${target}`);
      } else {
        console.log(
          `${target}: ${row.models} rows still missing models/provider, ${row.content} rows still missing content`
        );
      }
    } catch (err) {
      throw new Error(this.safeErrMsg(err));
    } finally {
      await client.end();
    }
  }
}

/**
 * pnpm tsx src/test/backfill-audiogen-models.ts --env dev --target gen-rows
 * pnpm tsx src/test/backfill-audiogen-models.ts --env dev --target exe
 * pnpm tsx src/test/backfill-audiogen-models.ts --env dev --target cross-check
 */

const env = process.argv[3];
if (env === "dev" || env === "prod") {
  const backfillWorkup = new BackfillAudioGenModelsWorkup(new Fs(process.cwd()));
  if (process.argv[5] === "gen-rows") {
    void backfillWorkup.genRows(env);
  }
  if (process.argv[5] === "exe") {
    void backfillWorkup.exe(env);
  }
  if (process.argv[5] === "cross-check") {
    void backfillWorkup.crossCheck(env);
  }
}
