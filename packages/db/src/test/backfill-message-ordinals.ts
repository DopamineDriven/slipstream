import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import pg from "pg";

dotenv.config({ quiet: true });

type BackfillTarget = "dev" | "prod";

class BackfillOrdinalsWorkup {
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

  public async genConvoIds(target: BackfillTarget) {
    const connectionString = await this.resolveDbUrl(target);

    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }

    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
      const getConvoIds = await client.query<{ id: string }>(
        `SELECT id FROM "Conversation"`
      );

      if (getConvoIds.rows.length === 0) {
        console.log("No conversations found");
      }

      const ids = getConvoIds.rows.map(t => t.id);

      this.fs.withWs(
        `src/test/__out__/backfill/ordinals/${target}/convoIds.json`,
        JSON.stringify(ids)
      );
      return ids;
    } catch (err) {
      throw new Error(this.safeErrMsg(err));
    } finally {
      await client.end();
    }
  }

  public async backfill(target: BackfillTarget, convoIds: string[]) {
    const connectionString = await this.resolveDbUrl(target);
    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }

    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
      for (const convoId of convoIds) {
        // prettier-ignore
        const res = await client.query(
          `UPDATE "Message" AS m
           SET "ordinal" = sub.rn
           FROM (
             SELECT "id",
                    (ROW_NUMBER() OVER (
                      ORDER BY "createdAt" ASC
                    ) - 1)::int AS rn
             FROM "Message"
             WHERE "conversationId" = $1
           ) AS sub
           WHERE m."id" = sub."id"`,
          [convoId]
        );

        console.log(
          `[${convoId}] assigned ordinals to ${res.rowCount ?? 0} messages`
        );
      }
    } catch (err) {
      throw new Error(this.safeErrMsg(err));
    } finally {
      await client.end();
    }
  }

  public async exe(target: BackfillTarget) {
    const ids = await this.genConvoIds(target);
    const t0 = performance.now();
    if (ids.length > 0) {
      await this.backfill(target, ids);
    }
    const t1 = performance.now();
    console.log(
      `took ${t1 - t0}ms to backfill ordinals across ${ids.length} ${target} conversations`
    );
  }
}

/**
 * pnpm tsx src/test/backfill-ordinals.ts --env dev --target exe
 * pnpm tsx src/test/backfill-ordinals.ts --env dev --target gen-convoIds
 */

if (process.argv[3] === "dev" || process.argv[3] === "prod") {
  const backfillWorkup = new BackfillOrdinalsWorkup(new Fs(process.cwd()));
  if (process.argv[5] === "exe") {
    backfillWorkup.exe(process.argv[3]);
  }
  if (process.argv[5] === "gen-convoIds") {
    backfillWorkup.genConvoIds(process.argv[3]);
  }
}
