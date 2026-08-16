import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CliIdentityConfigService } from "@/identity-config.ts";
import type { CliConfigDTO, EventTypeMap } from "@slipstream/types";

/**
 * contract tests for the identity-plane chain link (config-planning §3):
 * pull-based hydration, uniform update acks reconciling to the canonical
 * DTO on success AND failure, re-request as the recency refresh trigger.
 * The test subclass captures the send/on seams — no socket involved.
 */
type CapturedHandlerMap = {
  [K in keyof EventTypeMap]?: (data: EventTypeMap[K]) => void;
};

class TestIdentityConfig extends CliIdentityConfigService {
  public sent = Array.of<EventTypeMap[keyof EventTypeMap]>();
  private captured: CapturedHandlerMap = {};

  public on<const K extends keyof EventTypeMap>(
    event: K,
    handler: (data: EventTypeMap[K]) => void
  ) {
    // same idiom as the client's CliHandlerMap registration (client.ts on())
    this.captured[event] = handler as CapturedHandlerMap[K];
  }

  protected handlerFor<const K extends keyof EventTypeMap>(event: K) {
    return this.captured[event] as
      | ((data: EventTypeMap[K]) => void)
      | undefined;
  }

  public send<const K extends keyof EventTypeMap>(data: EventTypeMap[K]) {
    this.sent.push(data);
  }

  public fire<const K extends keyof EventTypeMap>(
    event: K,
    data: EventTypeMap[K]
  ) {
    this.captured[event]?.(data);
  }

  public wire() {
    this.wireIdentityConfig();
  }

  public hydrate() {
    this.hydrateIdentity();
  }

  public refresh() {
    this.refreshRecentConvos();
  }

  public update(patch: EventTypeMap["cli_config_update"]["patch"]) {
    this.sendCliConfigUpdate(patch);
  }

  public get config() {
    return this.cliConfig;
  }

  public get recents() {
    return this.recentConversationIds;
  }

  public hookHydrated(fn: (config: CliConfigDTO) => void) {
    this.onCliConfigHydrated = fn;
  }

  public hookUpdateAck(
    fn: (ack: EventTypeMap["cli_config_update_ack"]) => void
  ) {
    this.onCliConfigUpdateAck = fn;
  }
}

const dto = {
  defaultProvider: "anthropic",
  defaultModel: "claude-fable-5",
  showThinking: true,
  schemaVersion: "v1_0"
} as const satisfies CliConfigDTO;

describe("CliIdentityConfigService — pull-based identity plane", () => {
  it("hydrateIdentity sends exactly the two request frames, in order", () => {
    const svc = new TestIdentityConfig();
    svc.hydrate();
    assert.deepEqual(
      svc.sent.map(s => s.type),
      ["cli_config_hydrate", "cli_recent_convos"]
    );
  });

  it("the pull rides connection_established and composes with a prior handler", () => {
    const svc = new TestIdentityConfig();
    let priorRan = false;
    // a link that already owns the frame (the provider-context assignment)
    svc.on("connection_established", () => {
      priorRan = true;
    });
    svc.wire();
    svc.fire("connection_established", {
      type: "connection_established",
      providerContext: { isSet: {}, isDefault: {} } as never
    });
    assert.equal(priorRan, true);
    assert.deepEqual(
      svc.sent.map(s => s.type),
      ["cli_config_hydrate", "cli_recent_convos"]
    );
  });

  it("hydrate ack assigns cliConfig and fires the seed hook AFTER assignment", () => {
    const svc = new TestIdentityConfig();
    svc.wire();
    let seenAtHookTime: CliConfigDTO | undefined = undefined;
    svc.hookHydrated(() => {
      seenAtHookTime = svc.config;
    });
    svc.fire("cli_config_hydrate_ack", {
      type: "cli_config_hydrate_ack",
      cliConfig: dto
    });
    assert.deepEqual(svc.config, dto);
    assert.deepEqual(seenAtHookTime, dto);
  });

  it("a REJECTED update ack still reconciles to the canonical DTO (snap-back)", () => {
    const svc = new TestIdentityConfig();
    svc.wire();
    svc.fire("cli_config_hydrate_ack", {
      type: "cli_config_hydrate_ack",
      cliConfig: dto
    });
    const acks = Array.of<EventTypeMap["cli_config_update_ack"]>();
    svc.hookUpdateAck(ack => acks.push(ack));
    // server rejected the patch — uniform shape: reason present, canonical
    // truth attached, same field set as success
    const canonical = {
      ...dto,
      defaultModel: "claude-fable-5"
    } satisfies CliConfigDTO;
    svc.fire("cli_config_update_ack", {
      type: "cli_config_update_ack",
      success: false,
      reason: "grok-4.6 does not belong to anthropic",
      cliConfig: canonical
    });
    assert.deepEqual(svc.config, canonical);
    assert.equal(acks[0]?.success, false);
    assert.equal(typeof acks[0]?.reason, "string");
  });

  it("a successful update ack reconciles and carries no reason", () => {
    const svc = new TestIdentityConfig();
    svc.wire();
    const next = {
      ...dto,
      defaultProvider: "sakana",
      defaultModel: "fugu"
    } satisfies CliConfigDTO;
    svc.fire("cli_config_update_ack", {
      type: "cli_config_update_ack",
      success: true,
      reason: undefined,
      cliConfig: next
    });
    assert.deepEqual(svc.config, next);
  });

  it("recency: ack replaces the id list; refresh re-sends the request frame", () => {
    const svc = new TestIdentityConfig();
    svc.wire();
    svc.fire("cli_recent_convos_ack", {
      type: "cli_recent_convos_ack",
      conversationIds: ["cm_a", "cm_b"]
    });
    assert.deepEqual(svc.recents, ["cm_a", "cm_b"]);
    svc.fire("cli_recent_convos_ack", {
      type: "cli_recent_convos_ack",
      conversationIds: ["cm_c"]
    });
    assert.deepEqual(svc.recents, ["cm_c"]);
    svc.refresh();
    assert.equal(svc.sent[0]?.type, "cli_recent_convos");
  });

  it("update sends the patch verbatim under the cli_config_update frame", () => {
    const svc = new TestIdentityConfig();
    svc.update({ defaultProvider: "sakana", defaultModel: "fugu" });
    const frame = svc.sent[0];
    assert.equal(frame?.type, "cli_config_update");
    if (frame?.type === "cli_config_update") {
      assert.deepEqual(frame.patch, {
        defaultProvider: "sakana",
        defaultModel: "fugu"
      });
    }
  });
});
