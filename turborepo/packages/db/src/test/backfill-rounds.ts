import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import pg from "pg";

dotenv.config({ quiet: true });

class BackfillRoundsWorkup {
  constructor(protected fs: Fs) {}
  private async resolveDbUrl(target: "dev" | "prod") {
    if (target === "dev" && process.env.DATABASE_URL) {
      return process.env.DATABASE_URL;
    } else {
      const { Credentials } = await import("@slipstream/credentials");
      const cred = new Credentials();
      return await cred.get("DATABASE_URL");
    }
  }

  public async genConvoIds(target: "dev" | "prod") {
    const connectionString = await this.resolveDbUrl(target);

    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }

    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
      // Verify column exists before proceeding
      // const _colCheck = await client.query<{ exists: boolean }>(
      //   `SELECT EXISTS (
      //   SELECT 1 FROM information_schema.columns
      //   WHERE table_name = 'Message' AND column_name = 'round'
      // ) as exists`
      // );
      // prettier-ignore
      const getConvoIds = await client.query<{ id: string }>(
        `SELECT id FROM "Conversation"
        LIMIT 500`
      );

      if (getConvoIds.rows.length === 0) {
        return await client.end();
      }

      const ids = getConvoIds.rows.map(t => t.id);

        this.fs.withWs(
          `src/test/__out__/backfill/rounds/${target}/convoIds.json`,
          JSON.stringify(ids)
        );
    } catch (err) {
      throw new Error(
        err instanceof Error
          ? err.message
          : typeof err !== "string"
            ? JSON.stringify(err, null, 2)
            : err
      );
    } finally {
      await client.end();
    }
  }

  public async backfillById(_id: string) {}
}
const backfillWorkup = new BackfillRoundsWorkup(new Fs(process.cwd()));

/**
 * pnpm tsx src/test/backfill-rounds.ts --phase workup --env dev
 *
 * pnpm tsx src/test/backfill-rounds.ts --phase exe --env dev
 */

if (process.argv[3] === "workup" || process.argv[3] === "exe") {
  if (process.argv[5] === "dev" || process.argv[5] === "prod") {
    if (process.argv[3] === "workup") {
      backfillWorkup.genConvoIds(process.argv[5]);
    }
  } else {
    /**
     * exe actual round backfill once addition of rounds has been completed
     */
  }
}
