import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import pg from "pg";

dotenv.config({ quiet: true });

type BackfillTarget = "dev" | "prod";

interface ImageGenOutputRow {
  id: string;
  kind: "PARTIAL" | "FINAL";
  /** ImageGenJob.provider — copied onto the output for parity with InlineImageGenOutput */
  provider: string;
  /** ImageGenJob.model — the model the request ran under */
  jobModel: string;
  /** o."createdAt" rendered as a UTC instant (the column is timestamp without time zone, UTC by convention) */
  createdAtUtc: string;
}

interface ResolvedRow extends ImageGenOutputRow {
  facilitatingModel: string;
  generatingModel: string | null;
  /**
   * pure     — the job model IS an image model; generating = facilitating
   * era      — an openai text facilitator; generating = the tool's pinned model at createdAt
   * pre-era  — an openai text facilitator before the first recorded pin change (gpt-image-1)
   * unresolved — a pair this script has no rule for; reported, never written
   */
  basis: "pure" | "era" | "pre-era" | "unresolved";
}

class BackfillImageGenModelsWorkup {
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

  /**
   * The generating model pinned behind openai's Responses `image_generation`
   * tool, as from-inclusive UTC instants. Anything earlier than the first
   * entry is `gpt-image-1`.
   *
   * dev ran BRANCH code, so its cutoffs are the commits that changed the pin;
   * prod runs main, so its cutoffs are the merges. Both are code-history
   * cutoffs — a deploy that lagged its merge would shift a prod boundary later.
   */
  private get openaiToolEras() {
    return {
      dev: [
        { from: "2025-12-30T15:32:58Z", model: "gpt-image-1.5" }, // f2fedb6
        { from: "2026-04-24T05:29:11Z", model: "gpt-image-2" }, // 28c4fc4
        { from: "2026-09-10T08:47:44Z", model: "gpt-image-2.5-sunburst" } // 89f5997
      ],
      prod: [
        { from: "2026-01-01T04:07:52Z", model: "gpt-image-1.5" }, // PR #307
        { from: "2026-04-24T07:47:48Z", model: "gpt-image-2" }, // PR #357
        { from: "2026-09-10T10:16:09Z", model: "gpt-image-2.5-sunburst" } // PR #407
      ]
    } as const satisfies Record<
      BackfillTarget,
      readonly { from: string; model: string }[]
    >;
  }

  private get preEraOpenaiToolModel() {
    return "gpt-image-1" as const;
  }

  /**
   * Job models that generate the image themselves — no facilitator in
   * between, so both columns take the same value. Matched within the job's
   * provider. Retired ids stay listed: the backfill reads history.
   * (`grok-2-image-1212` is from the dev rows of Nov 2025.)
   */
  protected pureImageModels = new Map<string, ReadonlySet<string>>([
    [
      "GEMINI",
      new Set([
        "gemini-2.5-flash-image",
        "gemini-3-pro-image-preview",
        "gemini-3.1-flash-image-preview",
        "gemini-3.1-flash-lite-image"
      ])
    ],
    [
      "GROK",
      new Set([
        "grok-2-image-1212",
        "grok-imagine-image",
        "grok-imagine-image-2.0",
        "grok-imagine-image-pro",
        "grok-imagine-image-quality"
      ])
    ],
    ["META", new Set(["muse-image-1.0"])],
    [
      "OPENAI",
      new Set([
        "dall-e-2",
        "dall-e-3",
        "gpt-image-1",
        "gpt-image-1-mini",
        "gpt-image-1.5",
        "gpt-image-2",
        "gpt-image-2.5-flare",
        "gpt-image-2.5-sunburst"
      ])
    ]
  ]);

  private resolve(target: BackfillTarget, row: ImageGenOutputRow) {
    if (this.pureImageModels.get(row.provider)?.has(row.jobModel)) {
      return {
        ...row,
        facilitatingModel: row.jobModel,
        generatingModel: row.jobModel,
        basis: "pure"
      } satisfies ResolvedRow;
    }
    if (row.provider !== "OPENAI") {
      return {
        ...row,
        facilitatingModel: row.jobModel,
        generatingModel: null,
        basis: "unresolved"
      } satisfies ResolvedRow;
    }
    const createdAt = Date.parse(row.createdAtUtc);
    const era = this.openaiToolEras[target].findLast(
      e => createdAt >= Date.parse(e.from)
    );
    return era
      ? ({
          ...row,
          facilitatingModel: row.jobModel,
          generatingModel: era.model,
          basis: "era"
        } satisfies ResolvedRow)
      : ({
          ...row,
          facilitatingModel: row.jobModel,
          generatingModel: this.preEraOpenaiToolModel,
          basis: "pre-era"
        } satisfies ResolvedRow);
  }

  /** read-only: every output joined to its job, resolved, written out for review */
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
      const outputs = await client.query<ImageGenOutputRow>(
        `SELECT o."id",
                o."kind",
                j."provider",
                j."model" AS "jobModel",
                to_char(o."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAtUtc"
         FROM "ImageGenOutput" o
         JOIN "ImageGenJob" j ON j."id" = o."jobId"
         ORDER BY o."createdAt" ASC`
      );

      if (outputs.rows.length === 0) {
        console.log("No image gen outputs found");
      }

      const rows = outputs.rows.map(row => this.resolve(target, row));

      const tally = new Map<string, number>();
      for (const r of rows) {
        const key = `${r.provider} · ${r.facilitatingModel} → ${r.generatingModel ?? "?"} · ${r.basis}`;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
      for (const [key, count] of tally) console.log(`${count}\t${key}`);

      this.fs.withWs(
        `src/test/__out__/backfill/imagegen-models/${target}/rows.json`,
        JSON.stringify(rows, null, 2)
      );
      return rows;
    } catch (err) {
      throw new Error(this.safeErrMsg(err));
    } finally {
      await client.end();
    }
  }

  public async backfill(target: BackfillTarget, rows: ResolvedRow[]) {
    const connectionString = await this.resolveDbUrl(target);
    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }

    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
      let written = 0;
      await client.query("BEGIN");
      for (const row of rows) {
        if (row.generatingModel === null) continue;
        // prettier-ignore
        const res = await client.query(
          `UPDATE "ImageGenOutput"
           SET "generatingModel" = $2,
               "facilitatingModel" = $3,
               "provider" = $4::"Provider"
           WHERE "id" = $1
             AND "generatingModel" IS NULL
             AND "facilitatingModel" IS NULL
             AND "provider" IS NULL`,
          [row.id, row.generatingModel, row.facilitatingModel, row.provider]
        );
        written += res.rowCount ?? 0;
      }
      await client.query("COMMIT");
      console.log(`wrote ${written} of ${rows.length} ${target} outputs`);
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
      await this.backfill(target, rows);
    }
    const t1 = performance.now();
    console.log(
      `took ${t1 - t0}ms to backfill models across ${rows.length} ${target} image gen outputs`
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
      const test = await client.query(
        `SELECT o."id"
         FROM "ImageGenOutput" o
         WHERE o."generatingModel" IS NULL
            OR o."facilitatingModel" IS NULL
            OR o."provider" IS NULL`
      );

      if (test.rows.length === 0) {
        console.log(`no remaining rows for ${target}`);
      } else {
        console.log(
          `${test.rows.length} records not yet backfilled for ${target}`
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
 * pnpm tsx src/test/backfill-imagegen-models.ts --env dev --target gen-rows
 * pnpm tsx src/test/backfill-imagegen-models.ts --env dev --target exe
 * pnpm tsx src/test/backfill-imagegen-models.ts --env dev --target cross-check
 */

if (process.argv[3] === "dev" || process.argv[3] === "prod") {
  const backfillWorkup = new BackfillImageGenModelsWorkup(
    new Fs(process.cwd())
  );
  if (process.argv[5] === "gen-rows") {
    void backfillWorkup.genRows(process.argv[3]);
  }
  if (process.argv[5] === "exe") {
    void backfillWorkup.exe(process.argv[3]);
  }
  if (process.argv[5] === "cross-check") {
    void backfillWorkup.crossCheck(process.argv[3]);
  }
}
