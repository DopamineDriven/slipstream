import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { ContentChunk } from "@mistralai/mistralai/models/components";
import { formatMistralHistory } from "@/mistral/index.ts";
import { MistralStreamContentService } from "@/mistral/stream-content.ts";
import type {
  ConversationSingleton,
  MessageSingleton
} from "@slipstream/types";

interface CapturedLikeMessageBlock {
  content: string;
  type: "THINKING" | "TEXT";
}

interface ReplayBlock {
  content: string;
  ordinal: number;
  type: "THINKING" | "TEXT";
}

interface TestHistoryMessageParams {
  readonly content: string;
  readonly model: string;
  readonly ordinal: number;
  readonly provider: MessageSingleton<true>["provider"];
  readonly senderType: MessageSingleton<true>["senderType"];
}

type ReplayEvent =
  | {
      content: string | readonly ContentChunk[] | null | undefined;
      type: "content";
    }
  | {
      type: "tool_round_boundary";
    };

function buildTestHistoryMessage({
  content,
  model,
  ordinal,
  provider,
  senderType
}: TestHistoryMessageParams) {
  const timestamp = new Date(ordinal * 1000);

  return {
    attachments: Array.of<MessageSingleton<true>["attachments"][number]>(),
    content,
    conversationId: "test-conversation",
    conversationMemoryChunkId: null,
    createdAt: timestamp,
    disliked: false,
    id: `test-message-${ordinal}`,
    isImageGen: false,
    liked: false,
    messageType: "TEXT",
    model,
    ordinal,
    provider,
    responseOutput: null,
    senderType,
    thinkingDuration: null,
    thinkingText: null,
    tryAgain: false,
    updatedAt: timestamp,
    userId: "test-user",
    userKeyId: null
  } satisfies MessageSingleton<true>;
}

function buildSparseMistralHistory() {
  return Array.from({ length: 350 }, (_, ordinal) => {
    if (ordinal === 0) {
      return buildTestHistoryMessage({
        content: "ancient mistral prompt",
        model: "mistral-medium-3.5",
        ordinal,
        provider: "MISTRAL",
        senderType: "USER"
      });
    }

    if (ordinal === 1) {
      return buildTestHistoryMessage({
        content: "ancient mistral answer",
        model: "mistral-medium-3.5",
        ordinal,
        provider: "MISTRAL",
        senderType: "AI"
      });
    }

    return buildTestHistoryMessage({
      content: `recent-global-${ordinal}`,
      model: ordinal % 2 === 0 ? "deepseek-v4-pro" : "command-a-03-2025",
      ordinal,
      provider: ordinal % 2 === 0 ? "DEEPSEEK" : "COHERE",
      senderType: ordinal % 2 === 0 ? "USER" : "AI"
    });
  });
}

function loadFixtureConversation(filename: string) {
  const candidatePaths = [
    fileURLToPath(
      new URL(
        `../__out__/conversations/%D0%B4%D0%B2%D0%B5-%D0%B3%D0%BE%D0%BB%D0%BE%D0%B2%D1%8B/${filename}`,
        import.meta.url
      )
    ),
    fileURLToPath(new URL(`./fixtures/${filename}`, import.meta.url))
  ];
  const path = candidatePaths.find(existsSync);
  if (!path) return null;
  return JSON.parse<ConversationSingleton<true>>(readFileSync(path, "utf8"));
}

const fixtureHistoryFormatterDeps = {
  filenameToHexExtTuple(url, compatStatus, encoded = true) {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const pathname = path.slice(path.lastIndexOf("/") + 1);
    const filename = compatStatus === "ACTIVE" ? pathname : pathname.slice(14);
    const dbFile = filename || "file.pdf";
    const withoutExt = dbFile.slice(0, dbFile.lastIndexOf("."));
    const ext = dbFile.slice(dbFile.lastIndexOf(".") + 1);
    const name = encoded
      ? Buffer.from(withoutExt, "utf-8").toString("hex")
      : withoutExt;

    return [name, ext] as const;
  },
  logInfo() {},
  safeErrMsg(error) {
    return error instanceof Error ? error.message : String(error);
  }
} satisfies Parameters<typeof formatMistralHistory>[1];

function formattedAssistantText(
  message: Extract<
    ReturnType<typeof formatMistralHistory>[number],
    { role: "assistant" }
  >
) {
  const { content } = message;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const parts = Array.of<string>();
    for (const chunk of content) {
      if ("text" in chunk && typeof chunk.text === "string") {
        parts.push(chunk.text);
      }
    }

    return parts.join("\n");
  }

  return "";
}

function formattedMessageText(
  message: ReturnType<typeof formatMistralHistory>[number]
) {
  if (!("content" in message)) {
    return "";
  }

  const { content } = message;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const parts = Array.of<string>();
    for (const chunk of content) {
      if ("text" in chunk && typeof chunk.text === "string") {
        parts.push(chunk.text);
      }
    }

    return parts.join("\n");
  }

  return "";
}

function thinkingChunk(text: string, closed: boolean) {
  return {
    type: "thinking",
    thinking: [
      {
        type: "text",
        text
      }
    ],
    closed
  } satisfies ContentChunk;
}

function referenceChunk(referenceId: number) {
  return {
    type: "reference",
    referenceIds: [referenceId]
  } satisfies ContentChunk;
}

function unknownToolReferenceChunk(referenceId: number) {
  return {
    type: "UNKNOWN",
    isUnknown: true,
    raw: {
      type: "tool_reference",
      tool: "file_search",
      title: `file-search-${referenceId}`
    }
  } satisfies ContentChunk;
}

function replayMistralBlocks(events: readonly ReplayEvent[]) {
  const streamContent = new MistralStreamContentService();
  const blocks = Array.of<ReplayBlock>();
  let activeBlock: ReplayBlock | undefined = undefined;
  let nextOrdinal = 0;

  const finalizeActiveBlock = () => {
    if (!activeBlock || activeBlock.content.length === 0) {
      activeBlock = undefined;
      return;
    }

    blocks.push({
      content: activeBlock.content,
      ordinal: nextOrdinal,
      type: activeBlock.type
    });
    nextOrdinal += 1;
    activeBlock = undefined;
  };

  const ensureActiveBlock = (type: ReplayBlock["type"]) => {
    if (activeBlock?.type !== type) {
      finalizeActiveBlock();
      activeBlock = {
        content: "",
        ordinal: nextOrdinal,
        type
      };
    }

    return activeBlock;
  };

  for (const event of events) {
    if (event.type === "tool_round_boundary") {
      finalizeActiveBlock();
      continue;
    }

    streamContent.processDeltaContent(event.content, {
      emitTextChunk(text) {
        ensureActiveBlock("TEXT").content += text;
      },
      emitThinkingChunk(text) {
        ensureActiveBlock("THINKING").content += text;
      }
    });
  }

  finalizeActiveBlock();

  return blocks;
}

function buildCapturedLikeBlocks() {
  const blocks = Array.from(
    { length: 548 },
    (_, index): CapturedLikeMessageBlock => ({
      content: `thinking-fragment-${index} `,
      type: "THINKING"
    })
  );

  blocks.push({
    content: "final answer",
    type: "TEXT"
  });

  return blocks;
}

describe("Mistral history formatter and thinking block lifecycle", () => {
  it("preserves sparse old Mistral turns before filling newest global context", () => {
    const formatted = formatMistralHistory(
      buildSparseMistralHistory(),
      fixtureHistoryFormatterDeps
    );
    const texts = formatted.map(formattedMessageText);

    assert.equal(formatted.length, 175);
    assert.deepEqual(texts.slice(0, 2), [
      "ancient mistral prompt",
      "ancient mistral answer"
    ]);
    assert.equal(texts.includes("recent-global-176"), false);
    assert.ok(texts.includes("recent-global-177"));
    assert.ok(texts.includes("recent-global-349"));
  });

  it("formats the full fixture history without empty assistant messages", t => {
    const convo = loadFixtureConversation("t6j6xpg4cn70iqdgh0fuowzm.json");
    if (!convo) {
      t.skip(
        "large fixture is gitignored; regenerate with transcript-gen when needed"
      );
      return;
    }

    const formatted = formatMistralHistory(
      convo.messages,
      fixtureHistoryFormatterDeps
    );
    const assistantMessages = formatted.filter(
      message => message.role === "assistant"
    );
    const emptyAssistantMessages = assistantMessages.filter(
      message => formattedAssistantText(message).trim().length === 0
    );
    const providerTagOnlyMessages = assistantMessages.filter(
      message =>
        formattedAssistantText(message).trim() === "[deepseek/deepseek-v4-pro]"
    );
    const serialized = JSON.stringify(formatted);
    const textChars = formatted.reduce(
      (total, message) => total + formattedMessageText(message).length,
      0
    );
    const assistantTextChars = assistantMessages.reduce(
      (total, message) => total + formattedAssistantText(message).length,
      0
    );
    const metrics = {
      assistantTextChars,
      emptyAssistantMessages: emptyAssistantMessages.length,
      formattedMessages: formatted.length,
      providerTagOnlyMessages: providerTagOnlyMessages.length,
      serializedBytes: Buffer.byteLength(serialized, "utf8"),
      sourceMessages: convo.messages.length,
      textChars
    };
    const metricsJson = JSON.stringify(metrics);

    t.diagnostic(metricsJson);
    process.stderr.write(`# mistral_history_formatter_size ${metricsJson}\n`);

    assert.equal(formatted.length, 175);
    assert.equal(emptyAssistantMessages.length, 0);
    assert.ok(providerTagOnlyMessages.length > 0);
  });

  it("coalesces the captured token-fragmented thinking stream into one block", () => {
    const capturedBlocks = buildCapturedLikeBlocks();
    const replayEvents = capturedBlocks.map((block, index): ReplayEvent => {
      if (block.type === "TEXT") {
        return {
          content: block.content,
          type: "content"
        };
      }

      const content = Array.of<ContentChunk>(
        thinkingChunk(block.content, true)
      );

      if (index % 20 === 0) {
        content.push(referenceChunk(index));
      }

      if (index % 33 === 0) {
        content.push(unknownToolReferenceChunk(index));
      }

      return {
        content,
        type: "content"
      };
    });

    const replayedBlocks = replayMistralBlocks(replayEvents);
    const expectedThinkingText = capturedBlocks
      .filter(block => block.type === "THINKING")
      .map(block => block.content)
      .join("");
    const expectedText = capturedBlocks
      .filter(block => block.type === "TEXT")
      .map(block => block.content)
      .join("");

    assert.equal(capturedBlocks.length, 549);
    assert.equal(
      capturedBlocks.filter(block => block.type === "THINKING").length,
      548
    );
    assert.equal(replayedBlocks.length, 2);
    assert.deepEqual(
      replayedBlocks.map(block => block.type),
      ["THINKING", "TEXT"]
    );
    assert.equal(replayedBlocks[0]?.content, expectedThinkingText);
    assert.equal(replayedBlocks[1]?.content, expectedText);
  });

  it("preserves real thinking boundaries across tool rounds", () => {
    const replayedBlocks = replayMistralBlocks([
      {
        content: [thinkingChunk("plan the search", true)],
        type: "content"
      },
      {
        type: "tool_round_boundary"
      },
      {
        content: [thinkingChunk("read the tool result", true)],
        type: "content"
      },
      {
        content: "final answer",
        type: "content"
      }
    ]);

    assert.deepEqual(replayedBlocks, [
      {
        content: "plan the search",
        ordinal: 0,
        type: "THINKING"
      },
      {
        content: "read the tool result",
        ordinal: 1,
        type: "THINKING"
      },
      {
        content: "final answer",
        ordinal: 2,
        type: "TEXT"
      }
    ]);
  });
});
