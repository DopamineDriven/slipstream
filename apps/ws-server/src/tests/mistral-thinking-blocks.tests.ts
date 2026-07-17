import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { MemoryAssemblyView } from "@/memory/types.ts";
import type { MistralMessageReq } from "@/mistral/types.ts";
import type { ContentChunk } from "@mistralai/mistralai/models/components";
import { MistralStreamContentService } from "@/mistral/stream-content.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  ConversationSingleton,
  MessageSingleton,
  UTR
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

type MistralContentChunk = UTR<ContentChunk, "type">;

const MISTRAL_HISTORY_MESSAGE_LIMIT = 175;

interface MistralAssistantHistoryTextMessage {
  readonly content: string;
  readonly model: string | null;
  readonly provider: $Enums.Provider;
}

function formatMistralHistoryModelIdentifier(
  msg: MistralAssistantHistoryTextMessage
) {
  return `[${msg.provider.toLowerCase()}/${msg.model ?? "model"}]`;
}

export function formatMistralAssistantHistoryText(
  msg: MistralAssistantHistoryTextMessage,
  textParts: readonly string[]
) {
  const joinedText = textParts.join("\n\n");

  if (joinedText.trim().length > 0) {
    return joinedText;
  }

  if (msg.content.trim().length > 0) {
    return msg.content;
  }

  return formatMistralHistoryModelIdentifier(msg);
}

interface MistralHistoryFormatterDeps {
  readonly filenameToHexExtTuple: (
    url: string,
    compatStatus: $Enums.CompatStatus | null,
    encoded?: boolean
  ) => readonly [filename: string, ext: string];
  readonly logInfo: (message: string) => void;
  readonly safeErrMsg: (error: unknown) => string;
}

export function formatMistralHistory(
  msgs: readonly MessageSingleton<true>[],
  deps: MistralHistoryFormatterDeps,
  memoryView: MemoryAssemblyView | null
) {
  // HMEM substitution assembly (Part II §2) replaces the retired 175-slice;
  // the limit survives only as the fresh-attachment gate below
  const historyMsgs = [...msgs].sort((a, b) => a.ordinal - b.ordinal);
  const allowFreshAttachments =
    historyMsgs.length < MISTRAL_HISTORY_MESSAGE_LIMIT;
  const formatted = Array.of<MistralMessageReq>();
  const lastIndex = historyMsgs.findLastIndex(
    m => m.provider === "MISTRAL" && m.senderType === "AI"
  );

  const isFirstMistralMsg = lastIndex === -1;
  const previouslySeenAttachmentIds = new Set<string>();

  if (!isFirstMistralMsg) {
    for (const msg of historyMsgs.slice(0, lastIndex + 1)) {
      for (const attachment of msg.attachments) {
        previouslySeenAttachmentIds.add(attachment.id);
      }
    }
  }

  const inlineAttachmentKeys = new Set<string>();
  const selectedAttachmentIds = new Set<string>();
  let documentSelected = false;
  let imageSelected = false;

  if (allowFreshAttachments) {
    for (
      let msgIndex = historyMsgs.length - 1;
      msgIndex > lastIndex && (!documentSelected || !imageSelected);
      msgIndex--
    ) {
      const msg = historyMsgs[msgIndex];
      if (!msg?.senderType || msg.senderType !== "USER") continue;

      for (
        let attachmentIndex = msg.attachments.length - 1;
        attachmentIndex >= 0 && (!documentSelected || !imageSelected);
        attachmentIndex--
      ) {
        const attachment = msg.attachments[attachmentIndex];
        if (!attachment) continue;
        if (previouslySeenAttachmentIds.has(attachment.id)) continue;
        if (selectedAttachmentIds.has(attachment.id)) continue;

        const activeCompat = attachment.compatStatus === "ACTIVE";
        const url = activeCompat ? attachment.compatCdnUrl : attachment.cdnUrl;
        const mime = activeCompat ? attachment.compatMime : attachment.mime;
        if (!url || !mime) continue;

        if (attachment.assetType === "DOCUMENT" && !documentSelected) {
          inlineAttachmentKeys.add(`${msg.id}:${attachment.id}`);
          selectedAttachmentIds.add(attachment.id);
          documentSelected = true;
        } else if (attachment.assetType === "IMAGE" && !imageSelected) {
          inlineAttachmentKeys.add(`${msg.id}:${attachment.id}`);
          selectedAttachmentIds.add(attachment.id);
          imageSelected = true;
        }
      }
    }
  }

  for (const [msgIndex, msg] of historyMsgs.entries()) {
    const claim = memoryView?.claim(msg.ordinal);
    if (claim) {
      if (claim.emit != null) {
        formatted.push({
          role: "assistant",
          content: [{ type: "text", text: claim.emit }]
        });
      }
      continue;
    }
    const isFreshContext = isFirstMistralMsg || msgIndex > lastIndex;
    if (msg.senderType === "USER") {
      const content = Array.of<ContentChunk>();
      const textParts = Array.of<string>();
      try {
        if (msg.attachments && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            const {
              cdnUrl,
              mime: ogMime,
              compatStatus,
              compatCdnUrl,
              compatMime
            } = att;
            const url = compatStatus === "ACTIVE" ? compatCdnUrl : cdnUrl;
            const mime = compatStatus === "ACTIVE" ? compatMime : ogMime;
            if (url && mime) {
              const [filename, ext] = deps.filenameToHexExtTuple(
                url,
                att.compatStatus,
                false
              );
              const name = `${filename}.${ext}`;
              if (att.assetType === "DOCUMENT") {
                try {
                  if (
                    isFreshContext &&
                    inlineAttachmentKeys.has(`${msg.id}:${att.id}`)
                  ) {
                    try {
                      content.push({
                        documentUrl: url,
                        documentName: filename,
                        type: "document_url"
                      } satisfies MistralContentChunk["document_url"]);
                    } catch {
                      textParts.push(`[${name}](${url})`);
                    }
                  } else {
                    textParts.push(`[${name}](${url})`);
                  }
                } catch {
                  textParts.push(`[${name}](${url})`);
                }
              } else if (att.assetType === "IMAGE") {
                if (
                  isFreshContext &&
                  inlineAttachmentKeys.has(`${msg.id}:${att.id}`)
                ) {
                  content.push({
                    type: "image_url",
                    imageUrl: { url, detail: "high" }
                  } satisfies MistralContentChunk["image_url"]);
                } else {
                  textParts.push(`![${name}](${url})`);
                }
              } else {
                textParts.push(`[${name}](${url})`);
              }
            }
          }
        }
      } catch (err) {
        throw new Error(deps.safeErrMsg(err));
      } finally {
        if (msg.messageBlocks && msg.messageBlocks.length > 0) {
          const textBlocks = Array.of<string>();
          for (const x of msg.messageBlocks) {
            if (x.type === "TEXT") {
              textBlocks.push(x.content);
            }
          }
          textParts.push(textBlocks.join(`\n`));
        } else {
          textParts.push(msg.content);
        }
      }
      content.push({ type: "text", text: textParts.join(`\n\n`) });
      formatted.push({ role: "user", content });
    } else {
      const content = Array.of<ContentChunk>();
      const textParts = Array.of<string>();
      const modelIdentifier = formatMistralHistoryModelIdentifier(msg);

      try {
        if (msg.attachments && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            const {
              cdnUrl,
              mime: ogMime,
              compatStatus,
              assetType,
              compatCdnUrl,
              compatMime
            } = att;
            const url = compatStatus === "ACTIVE" ? compatCdnUrl : cdnUrl;
            const mime = compatStatus === "ACTIVE" ? compatMime : ogMime;

            if (url && mime) {
              const [filename, ext] = deps.filenameToHexExtTuple(
                url,
                att.compatStatus,
                false
              );

              const name = `${filename}.${ext}`;

              if (assetType === "IMAGE") {
                textParts.push(`${modelIdentifier}\n![${name}](${url})`);
              } else {
                textParts.push(`${modelIdentifier}\n[${name}](${url})`);
              }
            }
          }
        }
      } catch (err) {
        deps.logInfo(deps.safeErrMsg(err));
      } finally {
        if (msg.messageBlocks && msg.messageBlocks.length > 0) {
          const textBlocks = Array.of<string>();
          for (const x of msg.messageBlocks) {
            if (x.type === "TEXT") {
              textBlocks.push(x.content);
            }
          }
          textParts.push(textBlocks.join(`\n\n`));
        } else {
          textParts.push(msg.content);
        }
      }
      content.push({
        type: "text",
        text: formatMistralAssistantHistoryText(msg, textParts)
      });
      formatted.push({ role: "assistant", content });
    }
  }
  return formatted;
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
  it("renders full history — the 175-slice is retired in favor of HMEM substitution", () => {
    const formatted = formatMistralHistory(
      buildSparseMistralHistory(),
      fixtureHistoryFormatterDeps,
      null
    );
    const texts = formatted.map(formattedMessageText);

    assert.equal(formatted.length, 350);
    assert.deepEqual(texts.slice(0, 2), [
      "ancient mistral prompt",
      "ancient mistral answer"
    ]);
    assert.ok(texts.includes("recent-global-176"));
    assert.ok(texts.includes("recent-global-349"));
  });

  it("substitutes covered ranges with name-tagged summary blocks via the assembly view", () => {
    const emitted = new Set<string>();
    // mirrors getHistoryAssemblyView: one section covering [30, 42), founding
    // window exempting nothing here (all covered ordinals ≥ 30)
    const view = {
      claim: (ordinal: number) => {
        if (ordinal < 30 || ordinal >= 42) return null;
        if (emitted.has("section-1")) return { emit: null } as const;
        emitted.add("section-1");
        return {
          emit: "[anthropic/claude-sonnet-5] conversation memory · messages [30-41]:\nConsolidated."
        } as const;
      }
    };
    const formatted = formatMistralHistory(
      buildSparseMistralHistory(),
      fixtureHistoryFormatterDeps,
      view
    );
    const texts = formatted.map(formattedMessageText);

    // 350 - 12 covered + 1 summary block
    assert.equal(formatted.length, 339);
    assert.ok(
      texts.some(t =>
        t.startsWith(
          "[anthropic/claude-sonnet-5] conversation memory · messages [30-41]:"
        )
      )
    );
    assert.equal(texts.includes("recent-global-35"), false);
    assert.ok(texts.includes("recent-global-29"));
    assert.ok(texts.includes("recent-global-42"));
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
      fixtureHistoryFormatterDeps,
      null
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

    // slice retired: without an assembly view the full history renders
    assert.equal(formatted.length, convo.messages.length);
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
