import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChatStore } from "@/state/chat/store";
import { ChatStoreRegistry } from "@/state/chat/store-registry";
import type { ChatRekeyEvent } from "@/state/chat/store-registry";
import type { ChatEventListener } from "@/utils/chat-ws-client";
import type { ChatWsEvent } from "@slipstream/types";
import {
  cloneMessage,
  loadFirstConvoFixture,
  makeChunk,
  makeError,
  makeRequest,
  makeResponse
} from "./fixtures";

// Gitignored real convo dumps — fixture-dependent tests skip gracefully when the dir is empty (fresh clone).
const fixture = loadFirstConvoFixture();
const userTemplate = fixture?.messages.find(m => m.senderType === "USER");
const aiTemplate = fixture?.messages.find(m => m.senderType === "AI");

/**
 * A minimal fan-out host exposing exactly what the registry binds to (`addListener`/`removeListener`), plus an
 * in-process `emit` to drive the routing path without a real socket.
 */
class FakeWsHost {
  readonly listeners = new Set<ChatEventListener>();
  addListener(listener: ChatEventListener) {
    this.listeners.add(listener);
  }
  removeListener(listener: ChatEventListener) {
    this.listeners.delete(listener);
  }
  emit(event: ChatWsEvent) {
    for (const listener of this.listeners) listener(event);
  }
}

describe("ChatStore — committed timeline", () => {
  it("ingestConversation orders by ordinal regardless of arrival order", t => {
    if (!fixture) {
      t.skip("no convo fixtures present");
      return;
    }
    const store = new ChatStore(fixture.id);
    // Reverse before ingest to prove the store re-sorts by ordinal, not arrival order.
    store.ingestConversation({
      ...fixture,
      messages: [...fixture.messages].reverse()
    });
    const committed = store.getCommittedSnapshot();
    assert.equal(committed.length, fixture.messages.length);
    for (let i = 1; i < committed.length; i++) {
      assert.ok(
        (committed[i]?.ordinal ?? 0) > (committed[i - 1]?.ordinal ?? 0),
        `committed[${i}] ordinal should exceed committed[${i - 1}]`
      );
    }
  });

  it("hydratePage is idempotent (re-ingest does not grow the timeline)", t => {
    if (!fixture) {
      t.skip("no convo fixtures present");
      return;
    }
    const store = new ChatStore(fixture.id);
    store.hydratePage({ convo: fixture });
    const firstCount = store.getCommittedSnapshot().length;
    store.hydratePage({ convo: fixture });
    assert.equal(store.getCommittedSnapshot().length, firstCount);
  });

  it("applyChunk preserves the committed reference (the perf invariant)", t => {
    if (!fixture) {
      t.skip("no convo fixtures present");
      return;
    }
    const store = new ChatStore(fixture.id);
    store.hydratePage({ convo: fixture });
    const before = store.getCommittedSnapshot();
    store.applyChunk(makeChunk(fixture.id, { chunk: "tok" }));
    assert.equal(
      store.getCommittedSnapshot(),
      before,
      "committed must be the same reference across a chunk"
    );
  });
});

describe("ChatStore — draft surface", () => {
  it("applyChunk accumulates raw chunk frames", () => {
    const store = new ChatStore("convo-1");
    store.applyChunk(makeChunk("convo-1", { chunk: "a" }));
    store.applyChunk(makeChunk("convo-1", { chunk: "b" }));
    assert.equal(store.getDraftSnapshot()?.length, 2);
  });

  it("notifies the draft surface but NOT the committed surface", () => {
    const store = new ChatStore("convo-1");
    let draftHits = 0;
    let committedHits = 0;
    store.subscribeDraft(() => draftHits++);
    store.subscribeCommitted(() => committedHits++);
    store.applyChunk(makeChunk("convo-1", { chunk: "a" }));
    assert.equal(draftHits, 1);
    assert.equal(committedHits, 0);
  });
});

describe("ChatStore — send + response lifecycle", () => {
  it("beginSend inserts the optimistic user and enters streaming", t => {
    if (!userTemplate) {
      t.skip("no convo fixtures present");
      return;
    }
    const store = new ChatStore("convo-x");
    store.beginSend(
      makeRequest("convo-x"),
      cloneMessage(userTemplate, {
        id: "u-temp",
        ordinal: 0,
        conversationId: "convo-x"
      })
    );
    const committed = store.getCommittedSnapshot();
    assert.equal(committed.length, 1);
    assert.equal(committed[0]?.id, "u-temp");
    assert.equal(store.getStatusSnapshot().isStreaming, true);
  });

  it("new-chat beginSend enters awaiting-id", t => {
    if (!userTemplate) {
      t.skip("no convo fixtures present");
      return;
    }
    const store = new ChatStore("new-chat");
    store.beginSend(
      makeRequest("new-chat"),
      cloneMessage(userTemplate, { id: "u-temp", ordinal: 0 })
    );
    assert.equal(store.isAwaitingRealId(), true);
    assert.equal(store.getStatusSnapshot().isNewChat, true);
  });

  it("applyResponse commits [ai, user] by id, drops the optimistic temp + draft", t => {
    if (!userTemplate || !aiTemplate || !fixture) {
      t.skip("no convo fixtures present");
      return;
    }
    const store = new ChatStore("convo-x");
    store.beginSend(
      makeRequest("convo-x"),
      cloneMessage(userTemplate, {
        id: "u-temp",
        ordinal: 0,
        conversationId: "convo-x"
      })
    );
    store.applyChunk(makeChunk("convo-x", { chunk: "partial" }));

    const realAi = cloneMessage(aiTemplate, {
      id: "a-real",
      ordinal: 1,
      conversationId: "convo-x"
    });
    const realUser = cloneMessage(userTemplate, {
      id: "u-real",
      ordinal: 0,
      conversationId: "convo-x"
    });
    store.applyResponse(
      makeResponse({ ...fixture, id: "convo-x", messages: [realAi, realUser] })
    );

    const committed = store.getCommittedSnapshot();
    assert.deepEqual(
      committed.map(m => m.id),
      ["u-real", "a-real"],
      "temp dropped; real [user, ai] committed in ordinal order"
    );
    assert.equal(store.getDraftSnapshot(), undefined);
    assert.equal(store.getStatusSnapshot().isStreaming, false);
  });

  it("applyError clears the draft + sets the error surface, preserving committed", t => {
    if (!userTemplate) {
      t.skip("no convo fixtures present");
      return;
    }
    const store = new ChatStore("convo-x");
    store.beginSend(
      makeRequest("convo-x"),
      cloneMessage(userTemplate, {
        id: "u-temp",
        ordinal: 0,
        conversationId: "convo-x"
      })
    );
    store.applyChunk(makeChunk("convo-x", { chunk: "partial" }));
    store.applyError(makeError("convo-x", "boom"));
    assert.equal(store.getErrorSnapshot(), "boom");
    assert.equal(store.getDraftSnapshot(), undefined);
    assert.equal(store.getStatusSnapshot().isStreaming, false);
    assert.equal(store.getCommittedSnapshot().length, 1);
  });
});

describe("ChatStore — flags + eviction guards", () => {
  it("clearError is a no-op when already clear (no snapshot churn)", () => {
    const store = new ChatStore("convo-1");
    let errorHits = 0;
    store.subscribeError(() => errorHits++);
    store.clearError();
    assert.equal(errorHits, 0);
  });

  it("isEvictable: false while streaming / with a draft / with subscribers", () => {
    const store = new ChatStore("convo-1");
    assert.equal(store.isEvictable(), true);
    store.applyChunk(makeChunk("convo-1", { chunk: "a" }));
    assert.equal(store.isEvictable(), false);
    store.resetStreamingState();
    assert.equal(store.isEvictable(), true);
    store.subscribeDraft(() => {});
    assert.equal(store.isEvictable(), false);
  });
});

describe("ChatStoreRegistry — routing + rekey + LRU", () => {
  it("getOrCreate returns the same instance per id", () => {
    const registry = new ChatStoreRegistry();
    assert.equal(registry.getOrCreate("c1"), registry.getOrCreate("c1"));
  });

  it("routes a chunk to the owning store by conversationId", () => {
    const registry = new ChatStoreRegistry();
    const host = new FakeWsHost();
    registry.bindClient(host);
    const store = registry.getOrCreate("c1");
    host.emit(makeChunk("c1", { chunk: "tok" }));
    assert.equal(store.getDraftSnapshot()?.length, 1);
  });

  it("bindClient is idempotent for the same host (no duplicate listener)", () => {
    const registry = new ChatStoreRegistry();
    const host = new FakeWsHost();
    registry.bindClient(host);
    registry.bindClient(host);
    assert.equal(host.listeners.size, 1);
  });

  it("new-chat → real-id: rekeys the same instance, emits decoupled then recoupled", t => {
    if (!userTemplate || !aiTemplate || !fixture) {
      t.skip("no convo fixtures present");
      return;
    }
    const registry = new ChatStoreRegistry();
    const host = new FakeWsHost();
    registry.bindClient(host);
    const rekeys = Array.of<ChatRekeyEvent>();
    registry.setRekeyHandler(event => rekeys.push(event));

    const store = registry.getOrCreate("new-chat");
    store.beginSend(
      makeRequest("new-chat"),
      cloneMessage(userTemplate, {
        id: "u-temp",
        ordinal: 0,
        conversationId: "new-chat"
      })
    );

    host.emit(makeChunk("real-123", { chunk: "tok" }));
    assert.equal(
      registry.getOrCreate("real-123"),
      store,
      "same instance now under the real key"
    );
    assert.equal(store.getStatusSnapshot().conversationId, "real-123");
    assert.equal(store.getStatusSnapshot().urlTransitionInFlight, true);
    assert.equal(rekeys.at(-1)?.phase, "decoupled");

    const realAi = cloneMessage(aiTemplate, {
      id: "a-real",
      ordinal: 1,
      conversationId: "real-123"
    });
    const realUser = cloneMessage(userTemplate, {
      id: "u-real",
      ordinal: 0,
      conversationId: "real-123"
    });
    host.emit(
      makeResponse({ ...fixture, id: "real-123", messages: [realAi, realUser] })
    );
    assert.equal(store.getStatusSnapshot().urlTransitionInFlight, false);
    assert.equal(rekeys.at(-1)?.phase, "recoupled");
  });

  it("LRU evicts quiescent stores past the cap but never a subscribed one", () => {
    const registry = new ChatStoreRegistry();
    const kept = registry.getOrCreate("keep");
    kept.subscribeDraft(() => {});
    for (let i = 0; i < 20; i++) registry.getOrCreate(`c${i}`);
    assert.notEqual(
      registry.debugSnapshot("keep"),
      null,
      "a subscribed store survives eviction"
    );
    assert.ok(
      registry.debugSnapshotAll().length <= 12,
      "registry respects the LRU cap"
    );
  });
});
