import * as dotenv from "dotenv";
import type { MemorySectionDraft } from "@/memory/types.ts";
import { ConversationMemoryWorkupService } from "@/memory/workup.ts";
import { ExtractService } from "@/extract/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { VoyageEmbeddingService } from "@/voyage/index.ts";
import { PrismaDbService } from "@slipstream/db/factory";

dotenv.config({ quiet: true });

/**
 * Memory sectioner dry run — renders a real conversation through the
 * memory-transcript-v1_0 renderer + token-based DP sectioner and dumps the
 * would-be sections to disk for eyeballing. Pure read path: NO chunk rows,
 * NO claims, NO embeddings — just the two exact-count tokenize bridge calls.
 *
 * usage (mirrors transcript-gen arg positions):
 *   tsx src/test/memory-section-dryrun.ts --target dev --id <conversationId> [--thinking true]
 */

const outRoot = "src/test/__out__/memory-sections" as const;

async function resolveSecrets(target: "dev" | "prod") {
  if (
    target === "dev" &&
    process.env.DATABASE_URL &&
    process.env.VOYAGE_API_KEY
  ) {
    return {
      databaseUrl: process.env.DATABASE_URL,
      voyageApiKey: process.env.VOYAGE_API_KEY
    };
  }
  const { Credentials } = await import("@slipstream/credentials");
  const cred = new Credentials();
  return {
    databaseUrl: process.env.DATABASE_URL ?? (await cred.get("DATABASE_URL")),
    voyageApiKey:
      process.env.VOYAGE_API_KEY ?? (await cred.get("VOYAGE_API_KEY"))
  };
}

function draftSummary(draft: MemorySectionDraft) {
  return {
    relativeIndex: draft.relativeIndex,
    provenanceId: draft.provenanceId,
    ordinalStart: draft.ordinalStart,
    ordinalEndExclusive: draft.ordinalEndExclusive,
    chunkedMessagesCount: draft.chunkedMessagesCount,
    tokenCount: draft.tokenCount,
    boundaryReason: draft.boundaryReason,
    exceedsEmbedCeiling: draft.exceedsEmbedCeiling,
    hasAttachments: draft.hasAttachments,
    chunkedAttachmentsCount: draft.chunkedAttachmentsCount,
    attachmentProvenanceIdsRaw: draft.attachmentProvenanceIdsRaw,
    providerModelsRaw: draft.providerModelsRaw,
    contentHashPrefix: draft.contentHash.slice(0, 16),
    messageTimestampStart: draft.messageTimestampStart.toISOString(),
    messageTimestampEnd: draft.messageTimestampEnd.toISOString()
  };
}

async function dryRun(
  target: "dev" | "prod",
  conversationId: string,
  withThinking: boolean
) {
  const t0 = performance.now();
  const { databaseUrl, voyageApiKey } = await resolveSecrets(target);
  const isProd = target === "prod";

  const logger = LoggerService.getLoggerInstance({
    serviceName: "ws-server",
    environment: isProd ? "production" : "development",
    region: process.env.AWS_REGION ?? "us-east-1",
    logLevel: "info",
    isProd
  });
  const extract = new ExtractService();
  const db = new PrismaDbService({
    connectionString: databaseUrl,
    poolMax: 5,
    idleTimeoutMs: 30000
  });
  const prisma = new PrismaService(db, extract, isProd);
  const voyage = new VoyageEmbeddingService(voyageApiKey);
  const workup = new ConversationMemoryWorkupService(logger, voyage, prisma);

  try {
    const [title, maxOrdinalExclusive] = await Promise.all([
      prisma.getConversationTitle(conversationId),
      prisma.getMaxOrdinalExclusive(conversationId)
    ]);

    console.log(
      `conversation: ${title ?? "(untitled)"} (${conversationId}) · maxOrdinalExclusive: ${maxOrdinalExclusive}`
    );
    if (maxOrdinalExclusive === 0) {
      console.log("no messages — nothing to section");
      return;
    }

    const messages = await prisma.getMessagesByOrdinalRange(
      conversationId,
      0,
      maxOrdinalExclusive
    );
    if (messages.length !== maxOrdinalExclusive) {
      console.warn(
        `sparse ordinals detected: fetched ${messages.length} rows for range [0, ${maxOrdinalExclusive}) — a real pass would bail here`
      );
    }

    const rendered = workup.renderMemoryRange(messages, withThinking);
    const drafts = await workup.sectionizeRenderedRange({
      conversationId,
      conversationTitle: title,
      rendered,
      includesThinking: withThinking
    });

    const cfg = workup.memoryIndexingConfig;
    console.log(
      `config: target=${cfg.targetSectionTokens} min=${cfg.minSectionTokens} max=${cfg.maxSectionTokens} (${cfg.embeddingModel})`
    );

    if (drafts.length === 0) {
      console.log(
        `no claimable sections — the whole range is below minSectionTokens (${cfg.minSectionTokens}); it stays unclaimed until more accumulates`
      );
      return;
    }

    const lastDraft = drafts[drafts.length - 1];
    const coveredEnd = lastDraft ? lastDraft.ordinalEndExclusive : 0;
    const summaries = drafts.map(draftSummary);
    console.table(
      summaries.map(
        ({
          relativeIndex,
          ordinalStart,
          ordinalEndExclusive,
          chunkedMessagesCount,
          tokenCount,
          boundaryReason,
          exceedsEmbedCeiling
        }) => ({
          section: relativeIndex,
          range: `[${ordinalStart}, ${ordinalEndExclusive})`,
          msgs: chunkedMessagesCount,
          tokens: tokenCount,
          boundary: boundaryReason,
          oversize: exceedsEmbedCeiling
        })
      )
    );
    if (coveredEnd < maxOrdinalExclusive) {
      console.log(
        `unclaimed tail: ordinals [${coveredEnd}, ${maxOrdinalExclusive}) stay below the watermark until more accumulates`
      );
    } else {
      console.log("full range covered — no unclaimed tail");
    }

    for (const draft of drafts) {
      prisma.extractor.withWs(
        `${outRoot}/${conversationId}/section-${String(draft.relativeIndex).padStart(2, "0")}-${draft.ordinalStart}-${draft.ordinalEndExclusive}.md`,
        draft.transcriptMarkdown
      );
    }
    prisma.extractor.withWs(
      `${outRoot}/${conversationId}/summary.json`,
      JSON.stringify(
        {
          conversationId,
          title,
          maxOrdinalExclusive,
          renderedMessages: rendered.length,
          withThinking,
          config: cfg,
          sections: summaries
        },
        null,
        2
      )
    );
    console.log(
      `wrote ${drafts.length} section transcript(s) + summary.json → ${outRoot}/${conversationId}/`
    );
  } finally {
    console.log(`completed in ${(performance.now() - t0).toFixed(0)} ms`);
    await voyage.exitPython();
  }
}

if (
  (process.argv[3] === "dev" || process.argv[3] === "prod") &&
  process.argv[5] &&
  /^[a-z0-9]{24}$/.test(process.argv[5])
) {
  const withThinking = process.argv[7] === "true";
  dryRun(process.argv[3], process.argv[5], withThinking)
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
} else {
  console.error(
    "usage: tsx src/test/memory-section-dryrun.ts --target <dev|prod> --id <conversationId> [--thinking true]"
  );
  process.exit(1);
}
