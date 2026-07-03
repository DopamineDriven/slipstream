import * as dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ quiet: true });

/**
 * Memory summary-state diagnostic — chunk lifecycle + summary error surfaces
 * for one conversation, plus fleet-wide summaryState counts.
 *
 * usage: tsx src/test/memory-summary-diag.ts --id <conversationId>
 */

async function main(conversationId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const chunks = await client.query(
      `SELECT "chunkIndex", "chunkingState", "summaryState", "summaryRetryCount",
              "summaryModel", left("summaryError", 220) AS err, "createdAt"
       FROM "ConversationMemoryChunk"
       WHERE "conversationId" = $1
       ORDER BY "chunkIndex" ASC`,
      [conversationId]
    );
    console.table(chunks.rows);
    const states = await client.query(
      `SELECT "summaryState", "chunkingState", count(*)
       FROM "ConversationMemoryChunk"
       GROUP BY "summaryState", "chunkingState"
       ORDER BY "summaryState", "chunkingState"`
    );
    console.table(states.rows);
  } finally {
    await client.end();
  }
}

const id = process.argv[3];
if (id && /^[a-z0-9]{24}$/.test(id)) {
  void main(id);
} else {
  console.error(
    "usage: tsx src/test/memory-summary-diag.ts --id <conversationId>"
  );
  process.exit(1);
}
