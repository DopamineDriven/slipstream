import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MistralStreamContentService } from "@/mistral/stream-content.ts";
import type { ContentChunk } from "@mistralai/mistralai/models/components";

interface CapturedLikeMessageBlock {
  content: string;
  type: "THINKING" | "TEXT";
}

interface ReplayBlock {
  content: string;
  ordinal: number;
  type: "THINKING" | "TEXT";
}

type ReplayEvent =
  | {
      content: string | readonly ContentChunk[] | null | undefined;
      type: "content";
    }
  | {
      type: "tool_round_boundary";
    };

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

describe("Mistral thinking block lifecycle", () => {
  it("coalesces the captured token-fragmented thinking stream into one block", () => {
    const capturedBlocks = buildCapturedLikeBlocks();
    const replayEvents = capturedBlocks.map((block, index): ReplayEvent => {
      if (block.type === "TEXT") {
        return {
          content: block.content,
          type: "content"
        };
      }

      const content = Array.of<ContentChunk>(thinkingChunk(block.content, true));

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
