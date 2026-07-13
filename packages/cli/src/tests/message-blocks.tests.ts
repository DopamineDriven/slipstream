import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isReasoningBlock,
  messageAnswerText,
  renderableBlocks
} from "@/message-blocks.ts";

function block(type: string | null, content: string | null, ordinal: number) {
  return { type, content, ordinal } as {
    type: "THINKING" | "TEXT" | "ENCRYPTED_THINKING" | null;
    content: string | null;
    ordinal: number | null;
  };
}

describe("isReasoningBlock — type is the switch", () => {
  it("THINKING and ENCRYPTED_THINKING are reasoning; TEXT is not", () => {
    assert.equal(isReasoningBlock("THINKING"), true);
    assert.equal(isReasoningBlock("ENCRYPTED_THINKING"), true);
    assert.equal(isReasoningBlock("TEXT"), false);
    assert.equal(isReasoningBlock(null), false);
  });
});

describe("renderableBlocks — ordinal order, encrypted dropped, empty skipped", () => {
  it("sorts by ordinal and preserves thinking + text", () => {
    const msg = {
      content: "flat fallback",
      messageBlocks: [
        block("TEXT", "the answer", 1),
        block("THINKING", "let me reason", 0)
      ]
    };
    const out = renderableBlocks(msg);
    assert.deepEqual(
      out.map(b => [b.type, b.content]),
      [
        ["THINKING", "let me reason"],
        ["TEXT", "the answer"]
      ]
    );
  });

  it("drops ENCRYPTED_THINKING (opaque) and empty-content blocks", () => {
    const msg = {
      content: "",
      messageBlocks: [
        block("ENCRYPTED_THINKING", "", 0),
        block("ENCRYPTED_THINKING", "opaque-blob", 1),
        block("TEXT", "", 2),
        block("TEXT", "real answer", 3)
      ]
    };
    assert.deepEqual(
      renderableBlocks(msg).map(b => b.content),
      ["real answer"]
    );
  });

  it("falls back to the flat content column when no blocks", () => {
    const msg = { content: "legacy body", messageBlocks: undefined };
    assert.deepEqual(renderableBlocks(msg).map(b => [b.type, b.content]), [
      ["TEXT", "legacy body"]
    ]);
  });

  it("empty flat content with no blocks yields nothing", () => {
    assert.deepEqual(renderableBlocks({ content: "" }), []);
  });
});

describe("messageAnswerText — TEXT blocks only, ordinal-joined", () => {
  it("joins multiple TEXT blocks and excludes thinking", () => {
    const msg = {
      content: "flat",
      messageBlocks: [
        block("THINKING", "reasoning excluded", 0),
        block("TEXT", "part one ", 1),
        block("TEXT", "part two", 2)
      ]
    };
    assert.equal(messageAnswerText(msg), "part one part two");
  });

  it("falls back to flat content when a message has only thinking blocks", () => {
    const msg = {
      content: "flat body",
      messageBlocks: [block("THINKING", "only reasoning", 0)]
    };
    assert.equal(messageAnswerText(msg), "flat body");
  });

  it("falls back to flat content when there are no blocks", () => {
    assert.equal(messageAnswerText({ content: "legacy" }), "legacy");
  });
});
