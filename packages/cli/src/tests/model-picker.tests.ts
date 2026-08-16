import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ModelPickerService } from "@/model-picker.ts";
import { modelIdsByProvider } from "@slipstream/types";

/**
 * pure-decision tests for the two-stage picker service — the registry is
 * the authority (no alias table), vercel is never pickable, resolution
 * accepts ids or display names, marks track default vs session.
 */
const svc = new ModelPickerService();

describe("ModelPickerService — registry-backed provider → model decisions", () => {
  it("lists every registry provider except vercel, in registry order", () => {
    const providers = svc.pickerProviders;
    assert.equal(providers.includes("vercel" as never), false);
    const expected = Object.keys(modelIdsByProvider).filter(p => p !== "vercel");
    assert.deepEqual(providers, expected);
  });

  it("provider rows mark the roaming default and the session provider distinctly", () => {
    const rows = svc.buildProviderRows("anthropic", "sakana");
    const anthropic = rows.find(r => r.provider === "anthropic");
    const sakana = rows.find(r => r.provider === "sakana");
    assert.equal(anthropic?.isDefault, true);
    assert.equal(anthropic?.isSession, false);
    assert.equal(sakana?.isDefault, false);
    assert.equal(sakana?.isSession, true);
    assert.equal(anthropic?.modelCount, modelIdsByProvider.anthropic.length);
  });

  it("model rows carry registry display names and per-model marks", () => {
    const rows = svc.buildModelRows("sakana", "fugu", "fugu-cyber");
    assert.deepEqual(
      rows.map(r => r.modelId),
      [...modelIdsByProvider.sakana]
    );
    const fugu = rows.find(r => r.modelId === "fugu");
    const cyber = rows.find(r => r.modelId === "fugu-cyber");
    assert.equal(fugu?.isDefault, true);
    assert.equal(cyber?.isSession, true);
    assert.equal(typeof fugu?.displayName, "string");
    assert.ok((fugu?.displayName.length ?? 0) > 0);
  });

  it("resolveTypedModel accepts an id or a display name (case-insensitive), rejects garbage", () => {
    const byId = svc.resolveTypedModel("fugu");
    assert.deepEqual(byId, { provider: "sakana", modelId: "fugu" });
    const name = svc.modelDisplayName("sakana", "fugu");
    const byName = svc.resolveTypedModel(name.toUpperCase());
    assert.deepEqual(byName, { provider: "sakana", modelId: "fugu" });
    assert.equal(svc.resolveTypedModel("not-a-model-anywhere"), undefined);
  });

  it("vercel ids never resolve — the dead API is unreachable even by exact id", () => {
    for (const id of modelIdsByProvider.vercel) {
      assert.equal(svc.resolveTypedModel(id), undefined);
    }
  });

  it("filterModelRows matches label or id substrings; empty query passes all", () => {
    const rows = svc.buildModelRows("anthropic", undefined, "");
    assert.equal(svc.filterModelRows(rows, "").length, rows.length);
    const fable = svc.filterModelRows(rows, "fable");
    assert.ok(fable.length >= 1);
    assert.ok(fable.every(r => /fable/i.test(`${r.displayName} ${r.modelId}`)));
  });

  it("windowRows keeps the selection visible and clamps at the tail", () => {
    const rows = Array.from({ length: 30 }, (_, i) => i);
    const mid = svc.windowRows(rows, 15, 10);
    assert.ok(mid.slice.includes(15));
    assert.equal(mid.slice.length, 10);
    const tail = svc.windowRows(rows, 29, 10);
    assert.equal(tail.start, 20);
    assert.deepEqual(tail.slice, rows.slice(20));
    assert.deepEqual(svc.windowRows(Array.of<number>(), 0, 10).slice, []);
  });
});
