import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HydratedTailPage } from "@/hydrated-history.ts";
import { formatHydratedTail } from "@/hydrated-history.ts";

const CAP = 10_000;

function page(
  title: string | null,
  ...messages: { ordinal: number; content: string; senderType?: string }[]
) {
  return {
    convo: {
      title,
      messages: messages.map(m => ({
        ordinal: m.ordinal,
        senderType: m.senderType ?? "USER",
        provider: "ANTHROPIC",
        model: m.senderType === "USER" ? null : "claude-fable-5",
        content: m.content
      }))
    }
  } satisfies HydratedTailPage;
}

describe("formatHydratedTail — lossless resume window", () => {
  it("preserves prose paragraphs verbatim, blank lines included", () => {
    const body =
      "First paragraph with several sentences. It keeps going.\n\nSecond paragraph after a blank line.\n\nThird.";
    const tail = formatHydratedTail([page("Prose", { ordinal: 0, content: body })], {
      tailCount: 8,
      perMessageCharCap: CAP
    });
    assert.equal(tail.messages.length, 1);
    assert.equal(tail.messages[0]?.body, body);
    assert.equal(tail.messages[0]?.truncated, false);
  });

  it("preserves code fences exactly — backticks, indentation, trailing newlines inside the fence", () => {
    const body =
      'Here is the fix:\n\n```ts\nfunction claim(ordinal: number) {\n  if (!sub) return null;\n\n  return { emit } as const;\n}\n```\n\nNote the early return.';
    const tail = formatHydratedTail([page("Code", { ordinal: 3, content: body })], {
      tailCount: 8,
      perMessageCharCap: CAP
    });
    assert.equal(tail.messages[0]?.body, body);
  });

  it("preserves table rows — pipes and newlines survive untouched", () => {
    const body =
      "| approach | p50 | p95 |\n| --- | --- | --- |\n| baseline | 12ms | 40ms |\n| warmed | 1ms | 3ms |";
    const tail = formatHydratedTail([page("Table", { ordinal: 5, content: body })], {
      tailCount: 8,
      perMessageCharCap: CAP
    });
    assert.equal(tail.messages[0]?.body, body);
  });

  it("preserves leading whitespace on every line", () => {
    const body = "    indented four\n\ttab-indented\n        eight deep";
    const tail = formatHydratedTail([page(null, { ordinal: 1, content: body })], {
      tailCount: 8,
      perMessageCharCap: CAP
    });
    assert.equal(tail.messages[0]?.body, body);
  });

  it("caps a pathological message with explicit metadata; smaller messages untouched", () => {
    const huge = "x".repeat(CAP + 5_000);
    const normal = "an ordinary answer";
    const tail = formatHydratedTail(
      [
        page("Cap", { ordinal: 10, content: huge }, { ordinal: 11, content: normal })
      ],
      { tailCount: 8, perMessageCharCap: CAP }
    );
    const [big, small] = tail.messages;
    assert.equal(big?.truncated, true);
    assert.equal(big?.body.length, CAP);
    assert.equal(big?.totalChars, CAP + 5_000);
    assert.equal(small?.truncated, false);
    assert.equal(small?.body, normal);
  });

  it("a message exactly at the cap is NOT truncated", () => {
    const exact = "y".repeat(CAP);
    const tail = formatHydratedTail([page(null, { ordinal: 0, content: exact })], {
      tailCount: 8,
      perMessageCharCap: CAP
    });
    assert.equal(tail.messages[0]?.truncated, false);
    assert.equal(tail.messages[0]?.body, exact);
  });

  it("selects the newest N by ordinal across unsorted multi-page input", () => {
    const tail = formatHydratedTail(
      [
        page("Multi", { ordinal: 7, content: "seven" }, { ordinal: 6, content: "six" }),
        page("Multi", { ordinal: 2, content: "two" }, { ordinal: 9, content: "nine" }),
        page("Multi", { ordinal: 8, content: "eight" })
      ],
      { tailCount: 3, perMessageCharCap: CAP }
    );
    assert.deepEqual(
      tail.messages.map(m => m.ordinal),
      [7, 8, 9]
    );
    assert.equal(tail.totalHydrated, 5);
    assert.equal(tail.shownFromOrdinal, 7);
    assert.equal(tail.shownToOrdinal, 9);
  });

  it("renders everything when tailCount exceeds the hydrated set", () => {
    const tail = formatHydratedTail(
      [page("Small", { ordinal: 0, content: "a" }, { ordinal: 1, content: "b" })],
      { tailCount: 8, perMessageCharCap: CAP }
    );
    assert.equal(tail.messages.length, 2);
    assert.equal(tail.shownFromOrdinal, 0);
    assert.equal(tail.shownToOrdinal, 1);
  });

  it("empty pages produce an empty window with null ordinals, not a crash", () => {
    const tail = formatHydratedTail([], { tailCount: 8, perMessageCharCap: CAP });
    assert.equal(tail.messages.length, 0);
    assert.equal(tail.totalHydrated, 0);
    assert.equal(tail.shownFromOrdinal, null);
    assert.equal(tail.shownToOrdinal, null);
    assert.equal(tail.title, null);
  });

  it("title comes from the first page and survives null", () => {
    const titled = formatHydratedTail(
      [page("Probing the Voyage", { ordinal: 0, content: "hi" })],
      { tailCount: 8, perMessageCharCap: CAP }
    );
    assert.equal(titled.title, "Probing the Voyage");
    const untitled = formatHydratedTail(
      [page(null, { ordinal: 0, content: "hi" })],
      { tailCount: 8, perMessageCharCap: CAP }
    );
    assert.equal(untitled.title, null);
  });
});
