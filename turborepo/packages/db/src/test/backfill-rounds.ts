import { Fs } from "@d0paminedriven/fs";
import { createId } from "@paralleldrive/cuid2";
import * as dotenv from "dotenv";
import pg from "pg";

interface MessageRow {
  id: string;
  conversationId: string;
  content: string;
  senderType: "USER" | "AI" | "SYSTEM";
  thinkingText?: string | null;
  thinkingDuration?: number | null;
  createdAt: Date;
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

  public async genConvoIds(target: BackfillTarget) {
    const connectionString = await this.resolveDbUrl(target);

    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }

    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
      // prettier-ignore
      const getConvoIds = await client.query<{ id: string }>(
        `SELECT id FROM "Conversation"
        LIMIT 500`
      );

      if (getConvoIds.rows.length === 0) {
        console.log("No conversations found");
      }

      const ids = getConvoIds.rows.map(t => t.id);

      this.fs.withWs(
        `src/test/__out__/backfill/rounds/${target}/convoIds.json`,
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
        const { rows: messages } = await client.query<MessageRow>(
          `SELECT "id", "conversationId", "content", "thinkingText", "thinkingDuration", "senderType", "createdAt"
         FROM "Message"
         WHERE "conversationId" = $1
         ORDER BY "createdAt" ASC
         LIMIT 700`,
          [convoId]
        );

        for (const msg of messages) {
          if (msg.senderType === "AI" && msg.thinkingText) {
            // thinking → ordinal 0
            await client.query(
              `INSERT INTO "MessageBlock" ("id", "messageId", "conversationId", "ordinal", "type", "content", "durationMs", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, 0, 'THINKING'::"MessageBlockType", $4, $5, $6, NOW())
             ON CONFLICT ("messageId", "ordinal") DO NOTHING`,
              [
                createId(),
                msg.id,
                convoId,
                msg.thinkingText,
                msg.thinkingDuration ?? 0,
                msg.createdAt
              ]
            );

            // text → ordinal 1
            await client.query(
              `INSERT INTO "MessageBlock" ("id", "messageId", "conversationId", "ordinal", "type", "content", "durationMs", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, 1, 'TEXT'::"MessageBlockType", $4, 0, $5, NOW())
             ON CONFLICT ("messageId", "ordinal") DO NOTHING`,
              [createId(), msg.id, convoId, msg.content, msg.createdAt]
            );
          } else {
            // no thinking → text gets ordinal 0
            await client.query(
              `INSERT INTO "MessageBlock" ("id", "messageId", "conversationId", "ordinal", "type", "content", "durationMs", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, 0, 'TEXT'::"MessageBlockType", $4, 0, $5, NOW())
             ON CONFLICT ("messageId", "ordinal") DO NOTHING`,
              [createId(), msg.id, convoId, msg.content, msg.createdAt]
            );
          }
        }

        console.log(`[${convoId}] backfilled ${messages.length} messages`);
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
      `took ${t1 - t0}ms to backfill messages from ${ids.length} ${target} conversations`
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
      const test = await client.query(
        `SELECT m."id", m."conversationId", m."senderType", m."createdAt"
        FROM "Message" m
        LEFT JOIN "MessageBlock" mb ON mb."messageId" = m."id"
        WHERE mb."id" IS NULL
        ORDER BY m."createdAt" DESC;`
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
const backfillWorkup = new BackfillRoundsWorkup(new Fs(process.cwd()));

/**
 * pnpm tsx src/test/backfill-rounds.ts --env dev
 */

if (process.argv[3] === "dev" || process.argv[3] === "prod") {
  backfillWorkup.exe(process.argv[3]);
}
