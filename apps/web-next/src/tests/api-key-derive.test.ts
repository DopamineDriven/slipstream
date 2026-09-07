import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveRows,
  describeFailure,
  isDeleteConfirmation
} from "@/ui/api-key-settings/derive";
import type { ClientContextWorkupProps, Provider } from "@slipstream/types";

/** all-false flag map with the listed providers flipped on — explicit so it stays assertion-free */
function flags(on: readonly Provider[]): Record<Provider, boolean> {
  return {
    alibaba: on.includes("alibaba"),
    anthropic: on.includes("anthropic"),
    cohere: on.includes("cohere"),
    deepseek: on.includes("deepseek"),
    gemini: on.includes("gemini"),
    grok: on.includes("grok"),
    meta: on.includes("meta"),
    minimax: on.includes("minimax"),
    mistral: on.includes("mistral"),
    moonshotai: on.includes("moonshotai"),
    openai: on.includes("openai"),
    sakana: on.includes("sakana"),
    vercel: on.includes("vercel"),
    zai: on.includes("zai")
  };
}

function ctx(
  set: readonly Provider[],
  def: readonly Provider[] = []
): ClientContextWorkupProps {
  return { isSet: flags(set), isDefault: flags(def) };
}

const roster = [
  { provider: "anthropic", text: "Anthropic" },
  { provider: "gemini", text: "Gemini" },
  { provider: "openai", text: "OpenAI" }
] as const;

describe("deriveRows", () => {
  it("splits the roster into configured and available, preserving roster order", () => {
    const { configured, available } = deriveRows(
      ctx(["openai", "anthropic"]),
      roster
    );
    assert.deepEqual(
      configured.map(r => r.provider),
      ["anthropic", "openai"]
    );
    assert.deepEqual(
      available.map(r => r.provider),
      ["gemini"]
    );
  });

  it("carries isDefault onto configured rows from providerContext", () => {
    const { configured } = deriveRows(
      ctx(["openai", "anthropic"], ["openai"]),
      roster
    );
    assert.deepEqual(
      configured.map(r => [r.provider, r.isDefault]),
      [
        ["anthropic", false],
        ["openai", true]
      ]
    );
  });

  it("keeps roster metadata (text) on both lists", () => {
    const { configured, available } = deriveRows(ctx(["gemini"]), roster);
    assert.equal(configured[0]?.text, "Gemini");
    assert.equal(available[0]?.text, "Anthropic");
  });

  it("returns everything as available when nothing is set", () => {
    const { configured, available } = deriveRows(ctx([]), roster);
    assert.equal(configured.length, 0);
    assert.equal(available.length, 3);
  });
});

describe("describeFailure", () => {
  it("maps unauthorized to a sign-in message", () => {
    assert.match(describeFailure("unauthorized", "Anthropic"), /sign(ed)? in/i);
  });

  it("maps a validator breadcrumb with a status to provider + status copy", () => {
    assert.equal(
      describeFailure(
        "validator message: invalid_api_key__anthropic__401",
        "Anthropic"
      ),
      "Anthropic rejected this key (HTTP 401)."
    );
  });

  it("maps a validator breadcrumb without a numeric status to provider copy", () => {
    assert.equal(
      describeFailure("validator message: something_odd", "Anthropic"),
      "Anthropic rejected this key."
    );
  });

  it("maps the reveal no-key payload", () => {
    assert.equal(
      describeFailure("No API key configured for anthropic!", "Anthropic"),
      "No key on file for Anthropic."
    );
  });

  it("maps the reveal decrypt-failure payload", () => {
    assert.match(
      describeFailure("Failed to Decrypt API key for anthropic", "Anthropic"),
      /decrypt/i
    );
  });

  it("maps a missing key input to an enter-a-key prompt", () => {
    assert.match(
      describeFailure("input api key is not of type string", "Anthropic"),
      /enter/i
    );
  });

  it("falls back to a generic message for anything unrecognized", () => {
    assert.equal(
      describeFailure("no input provider provided", "Anthropic"),
      "Couldn't save this key. Please try again."
    );
  });
});

describe("isDeleteConfirmation", () => {
  it("accepts exactly DELETE", () => {
    assert.equal(isDeleteConfirmation("DELETE"), true);
  });

  it("tolerates surrounding whitespace", () => {
    assert.equal(isDeleteConfirmation("  DELETE "), true);
  });

  it("is case-sensitive", () => {
    assert.equal(isDeleteConfirmation("delete"), false);
    assert.equal(isDeleteConfirmation("Delete"), false);
  });

  it("rejects partial and empty input", () => {
    assert.equal(isDeleteConfirmation("DELET"), false);
    assert.equal(isDeleteConfirmation(""), false);
  });
});
