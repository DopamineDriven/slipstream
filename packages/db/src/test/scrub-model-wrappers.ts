import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import pg from "pg";

dotenv.config({ quiet: true });

type BackfillTarget = "dev" | "prod";

interface CandidateRow {
  id: string;
  conversationId: string;
  content: string;
  provider?: string;
}

interface ScrubCandidate {
  id: string;
  conversationId: string;
  kind: "message" | "block";
  provider: string | null;
  charsBefore: number;
  charsAfter: number;
  interiorRemnant: boolean;
}

/**
 * Anthropic models mimic the platform's <model provider name> name-tag
 * wrappers in their own output; persisted verbatim, the stacks compound one
 * layer per generation (observed: 398 opening + 426 closing tags on a single
 * message; ~10% of net chars in a 350-message conversation).
 *
 * Surgical, anchored-only scrub: leading opening-tag stacks and trailing
 * closing-tag stacks are stripped — interior occurrences are CONTENT (this
 * corpus quotes and riffs on the notation) and are never touched. Idempotent.
 *
 * Scope: Message.content (senderType='AI', all providers — mimicry crosses
 * providers) and MessageBlock.content (type='TEXT' only; THINKING and
 * ENCRYPTED_THINKING are never touched). responseOutput is audited read-only.
 */
class ScrubModelWrappersWorkup {
  constructor(protected fs: Fs) {}

  private readonly leading =
    /^(?:\s*<model\s+provider="[^"]*"\s+name="[^"]*"\s*>)+\s*/;

  private readonly trailing = /(?:\s*<\/model>)+\s*$/;

  private readonly interiorOpen = /<model\s+provider="[^"]*"\s+name="[^"]*"\s*>/;

  private readonly interiorClose = /<\/model>/;

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

  /** anchored strip; trim fires ONLY when a stack was actually removed (no incidental whitespace edits) */
  public scrub(content: string) {
    const stripped = content
      .replace(this.leading, "")
      .replace(this.trailing, "");
    return stripped === content ? content : stripped.trim();
  }

  private hasInteriorTags(content: string) {
    return (
      this.interiorOpen.test(content) || this.interiorClose.test(content)
    );
  }

  private async fetchCandidates(client: pg.Client) {
    const { rows: messages } = await client.query<CandidateRow>(
      `SELECT m."id", m."conversationId", m."provider"::text AS "provider", m."content"
       FROM "Message" m
       WHERE m."senderType" = 'AI'
         AND (m."content" LIKE '%<model provider=%' OR m."content" LIKE '%</model>%')`
    );

    const { rows: blocks } = await client.query<CandidateRow>(
      `SELECT mb."id", mb."conversationId", mb."content"
       FROM "MessageBlock" mb
       JOIN "Message" m ON m."id" = mb."messageId"
       WHERE mb."type" = 'TEXT'
         AND m."senderType" = 'AI'
         AND (mb."content" LIKE '%<model provider=%' OR mb."content" LIKE '%</model>%')`
    );

    const candidates = Array.of<ScrubCandidate & { scrubbed: string }>();
    for (const row of messages) {
      const scrubbed = this.scrub(row.content);
      candidates.push({
        id: row.id,
        conversationId: row.conversationId,
        kind: "message",
        provider: row.provider ?? null,
        charsBefore: row.content.length,
        charsAfter: scrubbed.length,
        interiorRemnant: this.hasInteriorTags(scrubbed),
        scrubbed
      });
    }
    for (const row of blocks) {
      const scrubbed = this.scrub(row.content);
      candidates.push({
        id: row.id,
        conversationId: row.conversationId,
        kind: "block",
        provider: null,
        charsBefore: row.content.length,
        charsAfter: scrubbed.length,
        interiorRemnant: this.hasInteriorTags(scrubbed),
        scrubbed
      });
    }
    return candidates;
  }

  public async audit(target: BackfillTarget) {
    const connectionString = await this.resolveDbUrl(target);
    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }

    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
      const candidates = await this.fetchCandidates(client);

      const { rows: responseOutputExposure } = await client.query<{
        count: number;
      }>(
        `SELECT COUNT(*)::int AS count
         FROM "Message"
         WHERE "senderType" = 'AI'
           AND "responseOutput" IS NOT NULL
           AND ("responseOutput" LIKE '%<model provider=%' OR "responseOutput" LIKE '%</model>%')`
      );

      const perConversation = new Map<
        string,
        {
          messages: number;
          blocks: number;
          charsBefore: number;
          charsAfter: number;
        }
      >();
      for (const c of candidates) {
        const agg = perConversation.get(c.conversationId) ?? {
          messages: 0,
          blocks: 0,
          charsBefore: 0,
          charsAfter: 0
        };
        c.kind === "message" ? agg.messages++ : agg.blocks++;
        agg.charsBefore += c.charsBefore;
        agg.charsAfter += c.charsAfter;
        perConversation.set(c.conversationId, agg);
      }

      const changed = candidates.filter(c => c.charsAfter !== c.charsBefore);
      const totalSaved = changed.reduce(
        (acc, c) => acc + (c.charsBefore - c.charsAfter),
        0
      );

      const report = {
        target,
        candidates: candidates.length,
        wouldChange: changed.length,
        totalCharsSaved: totalSaved,
        interiorRemnants: candidates.filter(c => c.interiorRemnant).length,
        responseOutputExposure: responseOutputExposure[0]?.count ?? 0,
        byProvider: changed.reduce<Record<string, number>>((acc, c) => {
          const key = c.provider ?? "block";
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {}),
        perConversation: Object.fromEntries(
          [...perConversation.entries()].map(([id, agg]) => [
            id,
            { ...agg, saved: agg.charsBefore - agg.charsAfter }
          ])
        ),
        topOffenders: [...changed]
          .sort(
            (a, b) =>
              b.charsBefore - b.charsAfter - (a.charsBefore - a.charsAfter)
          )
          .slice(0, 20)
          .map(({ scrubbed: _scrubbed, ...rest }) => rest)
      };

      this.fs.withWs(
        `src/test/__out__/backfill/model-wrappers/${target}/audit.json`,
        JSON.stringify(report, null, 2)
      );
      console.log(
        `[audit:${target}] ${candidates.length} candidates, ${changed.length} would change, ${totalSaved} chars saved, ` +
          `${report.interiorRemnants} interior remnants (untouched by design), ` +
          `${report.responseOutputExposure} responseOutput rows exposed (read-only)`
      );
      return report;
    } catch (err) {
      throw new Error(this.safeErrMsg(err));
    } finally {
      await client.end();
    }
  }

  public async exe(target: BackfillTarget) {
    const connectionString = await this.resolveDbUrl(target);
    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }

    const client = new pg.Client({ connectionString });
    await client.connect();

    const t0 = performance.now();
    try {
      const candidates = await this.fetchCandidates(client);
      const changed = candidates.filter(c => c.charsAfter !== c.charsBefore);

      const byConversation = new Map<string, typeof changed>();
      for (const c of changed) {
        const existing = byConversation.get(c.conversationId);
        existing
          ? existing.push(c)
          : byConversation.set(c.conversationId, [c]);
      }

      let totalMessages = 0;
      let totalBlocks = 0;
      let totalSaved = 0;
      for (const [convoId, rows] of byConversation) {
        await client.query("BEGIN");
        try {
          let saved = 0;
          let messages = 0;
          let blocks = 0;
          for (const row of rows) {
            if (row.kind === "message") {
              await client.query(
                `UPDATE "Message" SET "content" = $2 WHERE "id" = $1`,
                [row.id, row.scrubbed]
              );
              messages++;
            } else {
              await client.query(
                `UPDATE "MessageBlock" SET "content" = $2 WHERE "id" = $1`,
                [row.id, row.scrubbed]
              );
              blocks++;
            }
            saved += row.charsBefore - row.charsAfter;
          }
          await client.query("COMMIT");
          totalMessages += messages;
          totalBlocks += blocks;
          totalSaved += saved;
          console.log(
            `[${convoId}] scrubbed ${messages} messages, ${blocks} blocks, ${saved} chars`
          );
        } catch (err) {
          await client.query("ROLLBACK");
          throw new Error(this.safeErrMsg(err));
        }
      }

      const t1 = performance.now();
      console.log(
        `took ${t1 - t0}ms to scrub ${totalMessages} messages + ${totalBlocks} blocks ` +
          `(${totalSaved} chars) across ${byConversation.size} ${target} conversations`
      );
    } catch (err) {
      throw new Error(this.safeErrMsg(err));
    } finally {
      await client.end();
    }
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
      const { rows: anchoredMessages } = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM "Message"
         WHERE "senderType" = 'AI'
           AND ("content" ~ '^\\s*<model\\s+provider=' OR "content" ~ '</model>\\s*$')`
      );
      const { rows: anchoredBlocks } = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM "MessageBlock" mb
         JOIN "Message" m ON m."id" = mb."messageId"
         WHERE mb."type" = 'TEXT'
           AND m."senderType" = 'AI'
           AND (mb."content" ~ '^\\s*<model\\s+provider=' OR mb."content" ~ '</model>\\s*$')`
      );
      const { rows: interior } = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM "Message"
         WHERE "senderType" = 'AI'
           AND ("content" LIKE '%<model provider=%' OR "content" LIKE '%</model>%')`
      );

      const anchoredM = anchoredMessages[0]?.count ?? 0;
      const anchoredB = anchoredBlocks[0]?.count ?? 0;
      if (anchoredM === 0 && anchoredB === 0) {
        console.log(
          `[crossCheck:${target}] clean — 0 anchored wrapper stacks remain ` +
            `(${interior[0]?.count ?? 0} rows carry interior tags: content, untouched by design)`
        );
      } else {
        console.log(
          `[crossCheck:${target}] ${anchoredM} messages + ${anchoredB} blocks still carry anchored stacks`
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
 * pnpm tsx src/test/scrub-model-wrappers.ts --env dev --target audit
 * pnpm tsx src/test/scrub-model-wrappers.ts --env dev --target exe
 * pnpm tsx src/test/scrub-model-wrappers.ts --env dev --target crossCheck
 */

if (process.argv[3] === "dev" || process.argv[3] === "prod") {
  const workup = new ScrubModelWrappersWorkup(new Fs(process.cwd()));
  if (process.argv[5] === "audit") {
    workup.audit(process.argv[3]);
  }
  if (process.argv[5] === "exe") {
    workup.exe(process.argv[3]);
  }
  if (process.argv[5] === "crossCheck") {
    workup.crossCheck(process.argv[3]);
  }
}
