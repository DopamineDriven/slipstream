import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MessageBlocksService } from "@/message-blocks.ts";

const m = new MessageBlocksService();

function block(type: string | null, content: string | null, ordinal: number) {
  return { type, content, ordinal } as {
    type: "THINKING" | "TEXT" | "ENCRYPTED_THINKING" | null;
    content: string | null;
    ordinal: number | null;
  };
}

describe("isReasoningBlock — type is the switch", () => {
  it("THINKING and ENCRYPTED_THINKING are reasoning; TEXT is not", () => {
    assert.equal(m.isReasoningBlock("THINKING"), true);
    assert.equal(m.isReasoningBlock("ENCRYPTED_THINKING"), true);
    assert.equal(m.isReasoningBlock("TEXT"), false);
    assert.equal(m.isReasoningBlock(null), false);
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
    const out = m.renderableBlocks(msg);
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
      m.renderableBlocks(msg).map(b => b.content),
      ["real answer"]
    );
  });

  it("falls back to the flat content column when no blocks", () => {
    const msg = { content: "legacy body", messageBlocks: undefined };
    assert.deepEqual(
      m.renderableBlocks(msg).map(b => [b.type, b.content]),
      [["TEXT", "legacy body"]]
    );
  });

  it("empty flat content with no blocks yields nothing", () => {
    assert.deepEqual(m.renderableBlocks({ content: "" }), []);
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
    assert.equal(m.messageAnswerText(msg), "part one part two");
  });

  it("falls back to flat content when a message has only thinking blocks", () => {
    const msg = {
      content: "flat body",
      messageBlocks: [block("THINKING", "only reasoning", 0)]
    };
    assert.equal(m.messageAnswerText(msg), "flat body");
  });

  it("falls back to flat content when there are no blocks", () => {
    assert.equal(m.messageAnswerText({ content: "legacy" }), "legacy");
  });
});
