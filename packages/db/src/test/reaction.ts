/**
 * SELECT
  COUNT(*)::text AS total_messages,
  COUNT(*) FILTER (WHERE "liked" = true)::text AS liked_true,
  COUNT(*) FILTER (WHERE "disliked" = true)::text AS disliked_true,
  COUNT(*) FILTER (WHERE "liked" = true AND "disliked" = true)::text AS both_true,
  COUNT(*) FILTER (WHERE "liked" IS NULL OR "disliked" IS NULL)::text AS has_null,
  COUNT(*) FILTER (WHERE ("liked" = true OR "disliked" = true))::text AS any_reaction
FROM "Message"
 */
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import pg from "pg";


type Probe = {
  total_messages: number;
  liked_true: number;
  disliked_true: number;
  both_true: number;
  has_null: number;
  any_reaction: number;
}

dotenv.config({ quiet: true });
type BackfillTarget = "dev" | "prod";

class BackfillRoundsWorkup {
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

  // public async genConvoIds(target: BackfillTarget) {
  //   const connectionString = await this.resolveDbUrl(target);

  //   if (!connectionString) {
  //     console.error("DATABASE_URL is not set");
  //     process.exit(1);
  //   }

  //   const client = new pg.Client({ connectionString });
  //   await client.connect();

  //   try {
  //     // prettier-ignore
  //     const getConvoIds = await client.query<{ id: string }>(
  //       `SELECT id FROM "Conversation"
  //       LIMIT 600`
  //     );

  //     if (getConvoIds.rows.length === 0) {
  //       console.log("No conversations found");
  //     }

  //     const ids = getConvoIds.rows.map(t => t.id);

  //     return ids;
  //   } catch (err) {
  //     throw new Error(this.safeErrMsg(err));
  //   } finally {
  //     await client.end();
  //   }
  // }

  public async check(target: BackfillTarget) {
    const connectionString = await this.resolveDbUrl(target);
    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }

    const client = new pg.Client({ connectionString });
    await client.connect();

    try {

        const { rows: messages } = await client.query<Probe>(
          `SELECT
  COUNT(*)::text AS total_messages,
  COUNT(*) FILTER (WHERE "liked" = true)::text AS liked_true,
  COUNT(*) FILTER (WHERE "disliked" = true)::text AS disliked_true,
  COUNT(*) FILTER (WHERE "liked" = true AND "disliked" = true)::text AS both_true,
  COUNT(*) FILTER (WHERE "liked" IS NULL OR "disliked" IS NULL)::text AS has_null,
  COUNT(*) FILTER (WHERE ("liked" = true OR "disliked" = true))::text AS any_reaction
FROM "Message"`
        );
      this.fs.withWs(
        `src/test/__out__/backfill/reaction-counts/${target}.json`,
        JSON.stringify(messages, null , 2)
      );



    } catch (err) {
      throw new Error(this.safeErrMsg(err));
    } finally {
      await client.end();
    }
  }
}
const backfillWorkup = new BackfillRoundsWorkup(new Fs(process.cwd()));

/**
 * pnpm tsx src/test/backfill-rounds.ts --env dev
 */

if (process.argv[3] === "dev" || process.argv[3] === "prod") {
  backfillWorkup.check(process.argv[3]);
}
