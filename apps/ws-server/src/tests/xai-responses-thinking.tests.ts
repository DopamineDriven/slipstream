import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { XAIResponsesSSEEvent } from "@/xai/responses-types.ts";
import { ResponsesStreamParser } from "@/xai/response-sse.ts";
import { Fs } from "@d0paminedriven/fs";

const encryptedTag = "*encrypted output...*" as const;

interface ActiveThinkingPhase {
  content: string;
  itemId: string;
  key: string;
  startedAt: number;
}

interface ThinkingReplayBlock {
  content: string;
  durationMs: number;
  itemId: string;
  key: string;
  type: "THINKING" | "ENCRYPTED_THINKING";
}

function reasoningPhaseKey(
  itemId: string,
  outputIndex: number,
  summaryIndex: number
) {
  return `${itemId}:${outputIndex}:${summaryIndex}` as const;
}
const fs = new Fs(process.cwd());
async function parseFixture(pathFromWsServer: string) {
  const fixture = (await fs.fileToBufferAsync(pathFromWsServer)).toString(
    "utf-8"
  );
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(fixture));
      controller.close();
    }
  });
  const events = Array.of<XAIResponsesSSEEvent>();

  for await (const event of new ResponsesStreamParser(stream)) {
    events.push(event);
  }

  return events;
}

function replayThinkingEvents(events: readonly XAIResponsesSSEEvent[]) {
  let activePhase: ActiveThinkingPhase | undefined = undefined;
  let now = 0;
  let thinkingDuration = 0;
  let thinkingDisplayAgg = "";
  const blocks = Array.of<ThinkingReplayBlock>();
  const summaryTextByPhase = new Map<string, string>();
  const doneTextByPhase = new Map<string, string>();
  const reasoningItemsWithSummaryText = new Set<string>();
  const displayedReasoningItemIds = new Set<string>();
  const encryptedReasoningByItemId = new Map<string, string>();

  const finalizeActivePhase = () => {
    if (!activePhase || activePhase.content.length === 0) {
      activePhase = undefined;
      return;
    }

    const durationMs = Math.max(0, now - activePhase.startedAt);

    thinkingDuration += durationMs;
    blocks.push({
      content: activePhase.content,
      durationMs,
      itemId: activePhase.itemId,
      key: activePhase.key,
      type: "THINKING"
    });
    activePhase = undefined;
  };

  for (const event of events) {
    now += 0.137;

    if (event.event === "response.reasoning_summary_part.added") {
      const key = reasoningPhaseKey(
        event.data.item_id,
        event.data.output_index,
        event.data.summary_index
      );

      if (activePhase && activePhase.key !== key) {
        finalizeActivePhase();
      }

      activePhase = {
        content: "",
        itemId: event.data.item_id,
        key,
        startedAt: now
      };
    }

    if (event.event === "response.reasoning_summary_text.delta") {
      const key = reasoningPhaseKey(
        event.data.item_id,
        event.data.output_index,
        event.data.summary_index
      );
      if (!activePhase) continue;
      if (activePhase.key !== key) {
        if (activePhase) {
          finalizeActivePhase();
        }

        activePhase = {
          content: "",
          itemId: event.data.item_id,
          key,
          startedAt: now
        };
      }

      activePhase.content += event.data.delta;
      summaryTextByPhase.set(
        key,
        (summaryTextByPhase.get(key) ?? "").concat(event.data.delta)
      );
      thinkingDisplayAgg += event.data.delta;
      reasoningItemsWithSummaryText.add(event.data.item_id);
      displayedReasoningItemIds.add(event.data.item_id);
    }

    if (event.event === "response.reasoning_summary_text.done") {
      const key = reasoningPhaseKey(
        event.data.item_id,
        event.data.output_index,
        event.data.summary_index
      );

      doneTextByPhase.set(key, event.data.text);
      finalizeActivePhase();
    }

    if (event.event === "response.reasoning_summary_part.done" && activePhase) {
      const key = reasoningPhaseKey(
        event.data.item_id,
        event.data.output_index,
        event.data.summary_index
      );

      if (activePhase.key === key) {
        finalizeActivePhase();
      }
    }

    if (
      event.event === "response.output_item.done" &&
      event.data.item.type === "reasoning" &&
      "encrypted_content" in event.data.item
    ) {
      encryptedReasoningByItemId.set(
        event.data.item.id,
        event.data.item.encrypted_content
      );

      if (activePhase) {
        finalizeActivePhase();
      }

      if (
        event.data.item.encrypted_content.length > 0 &&
        !reasoningItemsWithSummaryText.has(event.data.item.id) &&
        !displayedReasoningItemIds.has(event.data.item.id)
      ) {
        displayedReasoningItemIds.add(event.data.item.id);
        thinkingDisplayAgg =
          thinkingDisplayAgg.length > 0
            ? thinkingDisplayAgg.concat("\n").concat(encryptedTag)
            : encryptedTag;
        blocks.push({
          content: event.data.item.encrypted_content,
          durationMs: 0,
          itemId: event.data.item.id,
          key: event.data.item.id,
          type: "ENCRYPTED_THINKING"
        });
      }
    }
  }

  return {
    blocks,
    doneTextByPhase,
    encryptedReasoningByItemId,
    summaryTextByPhase,
    thinkingDisplayAgg,
    thinkingDuration
  } as const;
}

describe("xAI Responses thinking replay", () => {
  it("maps surfaced reasoning summary deltas to separate THINKING phases", async () => {
    const events = await parseFixture(
      "src/test/xai/tooling/grok-4-20-0309-01.txt"
    );
    const replay = replayThinkingEvents(events);
    const thinkingBlocks = replay.blocks.filter(
      block => block.type === "THINKING"
    );
    const encryptedBlocks = replay.blocks.filter(
      block => block.type === "ENCRYPTED_THINKING"
    );

    assert.equal(thinkingBlocks.length, 2);
    assert.equal(encryptedBlocks.length, 0);
    assert.equal(new Set(thinkingBlocks.map(block => block.itemId)).size, 1);
    assert.equal(new Set(thinkingBlocks.map(block => block.key)).size, 2);

    for (const block of thinkingBlocks) {
      assert.equal(block.content, replay.summaryTextByPhase.get(block.key));
      assert.equal(block.content, replay.doneTextByPhase.get(block.key));
      assert.ok(block.durationMs > 0);
      assert.equal(Number.isInteger(block.durationMs), false);
    }

    assert.equal(
      replay.thinkingDisplayAgg,
      Array.from(replay.summaryTextByPhase.values()).join("")
    );
    assert.equal(
      replay.thinkingDuration,
      thinkingBlocks.reduce((total, block) => total + block.durationMs, 0)
    );
  });

  it("keeps encrypted-only reasoning as a zero-duration fallback block", async () => {
    const events = await parseFixture(
      "src/test/xai/tooling/xai-tool-call-1-test-test.txt"
    );
    const replay = replayThinkingEvents(events);
    const thinkingBlocks = replay.blocks.filter(
      block => block.type === "THINKING"
    );
    const encryptedBlocks = replay.blocks.filter(
      block => block.type === "ENCRYPTED_THINKING"
    );
    const encryptedBlock = encryptedBlocks[0];

    assert.equal(thinkingBlocks.length, 0);
    assert.equal(encryptedBlocks.length, 1);
    assert.ok(encryptedBlock);
    assert.equal(encryptedBlock.durationMs, 0);
    assert.equal(
      replay.encryptedReasoningByItemId.get(encryptedBlock.itemId),
      encryptedBlock.content
    );
    assert.equal(replay.thinkingDisplayAgg, encryptedTag);
  });
});
