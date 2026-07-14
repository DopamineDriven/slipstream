import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConvoPickerService } from "@/convo-picker.ts";
import type { ConversationListEntry } from "@slipstream/types";

const p = new ConvoPickerService();

const NOW = 1_800_000_000_000;

function entry(
  id: string,
  title: string | null,
  agoMs: number,
  messageCount = 2
) {
  return {
    id,
    title,
    updatedAt: NOW - agoMs,
    messageCount
  } satisfies ConversationListEntry;
}

const CORPUS = [
  entry("cm_exp", "Expansio", 5_000),
  entry("cm_voyage1", "Probing the Voyage", 60_000),
  entry("cm_voyage2", "Voyage tokenizer notes", 30_000),
  entry("cm_fish", "The Fish Test", 10_000),
  entry("cm_untitled", null, 1_000),
  entry("cm_probe", "probe harness", 90_000)
];

describe("rankConversationEntries — typed text is a filter, never an identifier", () => {
  it("empty query returns everything, newest first", () => {
    const ranked = p.rankConversationEntries(CORPUS, "");
    assert.equal(ranked.length, CORPUS.length);
    assert.deepEqual(
      ranked.map(e => e.id),
      ["cm_untitled", "cm_exp", "cm_fish", "cm_voyage2", "cm_voyage1", "cm_probe"]
    );
  });

  it("exact title match outranks prefix, prefix outranks substring", () => {
    const ranked = p.rankConversationEntries(CORPUS, "probing the voyage");
    assert.equal(ranked[0]?.id, "cm_voyage1");
    const prefixed = p.rankConversationEntries(CORPUS, "voyage");
    // "Voyage tokenizer notes" starts with the query; "Probing the Voyage"
    // only contains it — prefix wins even though both match
    assert.equal(prefixed[0]?.id, "cm_voyage2");
    assert.equal(prefixed[1]?.id, "cm_voyage1");
  });

  it("word-boundary prefix beats mid-word substring", () => {
    const corpus = [
      entry("cm_mid", "Reprobe analysis", 1_000),
      entry("cm_word", "The probe results", 60_000)
    ];
    const ranked = p.rankConversationEntries(corpus, "probe");
    assert.equal(ranked[0]?.id, "cm_word");
  });

  it("matches on id substring so a pasted id filters to its entry", () => {
    const ranked = p.rankConversationEntries(CORPUS, "cm_fish");
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.id, "cm_fish");
  });

  it("non-matching query returns empty — nothing to select, nothing sent", () => {
    assert.deepEqual(p.rankConversationEntries(CORPUS, "zzz-not-real"), []);
  });

  it("untitled entries match by id only and render elsewhere as (untitled)", () => {
    const ranked = p.rankConversationEntries(CORPUS, "untitled");
    // the literal word "untitled" is not in the null title; id contains it
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.id, "cm_untitled");
  });

  it("is case-insensitive in both directions", () => {
    assert.equal(
      p.rankConversationEntries(CORPUS, "EXPANSIO")[0]?.id,
      "cm_exp"
    );
  });
});

describe("sanitizePickerTitle — one physical line per row, always", () => {
  it("collapses embedded newlines and runs of whitespace", () => {
    assert.equal(
      p.sanitizePickerTitle("You've summoned\nthe right\n\n  muse", 200),
      "You've summoned the right muse"
    );
  });

  it("truncates past the budget with an ellipsis", () => {
    const out = p.sanitizePickerTitle("a".repeat(300), 40);
    assert.equal(out.length, 40);
    assert.ok(out.endsWith("…"));
  });

  it("null titles render as (untitled)", () => {
    assert.equal(p.sanitizePickerTitle(null, 40), "(untitled)");
  });
});

describe("buildPickerView — frozen snapshot windowing", () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    entry(`cm_${String(i).padStart(2, "0")}`, `Conversation ${i}`, i * 1_000)
  );

  it("clamps selection into range and windows around it", () => {
    const view = p.buildPickerView(many, "", 25, 10);
    assert.equal(view.matches.length, 30);
    assert.equal(view.selectedIndex, 25);
    assert.equal(view.rows.length, 10);
    // selected row is inside the visible window
    assert.ok(view.rows.some(r => r.selected && r.entry.id === "cm_25"));
  });

  it("selection past the end clamps to the last match", () => {
    const view = p.buildPickerView(many, "", 999, 10);
    assert.equal(view.selectedIndex, 29);
  });

  it("negative selection clamps to zero", () => {
    const view = p.buildPickerView(many, "", -3, 10);
    assert.equal(view.selectedIndex, 0);
    assert.equal(view.rows[0]?.selected, true);
  });

  it("filter narrows matches and resets a stale selection into range", () => {
    const view = p.buildPickerView(many, "conversation 2", 20, 10);
    // matches: 2, 20-29 → 11 entries; selection index 20 is out of the
    // match-list range and clamps to the last match
    assert.equal(view.matches.length, 11);
    assert.equal(view.selectedIndex, 10);
  });

  it("no matches yields empty rows and a null selection", () => {
    const view = p.buildPickerView(many, "zzz", 0, 10);
    assert.equal(view.matches.length, 0);
    assert.equal(view.rows.length, 0);
    assert.equal(view.selectedIndex, null);
  });

  it("window scrolls: selecting the last of 30 shows the final 10", () => {
    const view = p.buildPickerView(many, "", 29, 10);
    assert.equal(view.rows[view.rows.length - 1]?.entry.id, "cm_29");
    assert.equal(view.rows.length, 10);
  });
});
