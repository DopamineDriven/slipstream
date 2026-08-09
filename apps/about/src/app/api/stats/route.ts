import type { CoherenceStats } from "@/types/api";
import { NextResponse } from "next/server";
import { safeErrMsg } from "@/lib/safe-err";
import { Pool } from "pg";

/**
 * Live "Sustained Coherence" stats, queried directly from the
 * aicoalesce platform Postgres via DATABASE_URL (read-only SELECT).
 *
 * Falls back to last known-good numbers when DATABASE_URL is not
 * configured or the query fails, so the page never breaks.
 */
const CONVERSATION_ID = "i145269bcv07b0xwavctk50r";

/** Today's known-good numbers — served if the database is unreachable. */
const FALLBACK_STATS = {
  models: 32,
  messages: 1592,
  attachments: 216,
  conversations: 1
} as const;

const STATS_QUERY = `
with attachment_count as (
  select COUNT(a."id")::int as "attCount"
  from "public"."Message" m
  left join "public"."Attachment" a on a."messageId" = m."id"
  where m."conversationId" = $1
)
select
  COUNT(*)::int as message_count,
  COUNT(distinct m."provider"::text || ':' || coalesce(m."model", '(no model)'))::int as model_count,
  (select "attCount" from attachment_count) as att_count
from "public"."Message" m
where m."conversationId" = $1
`;

/** Lazily-created singleton pool, reused across invocations. */
let pool: Pool | null = null;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  // eslint-disable-next-line
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000
    });
  }
  return pool;
}

export async function GET() {
  const db = getPool();

  if (db) {
    try {
      const { rows } = await db.query<{
        message_count: number;
        model_count: number;
        att_count: number | null;
      }>(STATS_QUERY, [CONVERSATION_ID]);

      const row = rows[0];
      if (row && row.message_count > 0) {
        const stats = {
          models: row.model_count,
          messages: row.message_count,
          attachments: row.att_count ?? 0,
          conversations: 1
        } satisfies CoherenceStats;
        return NextResponse.json(stats, {
          headers: {
            "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
            "x-stats-source": "database"
          }
        });
      }
    } catch (error) {
      console.error("[stats] query failed:", safeErrMsg(error));
    }
  }

  // DATABASE_URL not set, query failed, or conversation not found —
  // serve the last known-good static numbers so the page never breaks.
  return NextResponse.json(FALLBACK_STATS, {
    headers: {
      "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
      "x-stats-source": "fallback"
    }
  });
}
