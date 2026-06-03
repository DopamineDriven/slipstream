/**
 * Test fixtures + synthetic-event factories for the chat-store suite.
 *
 * Real conversation dumps live (gitignored) under `./__fixtures__/*.json` — regenerated
 * `ConversationSingleton<true>` shapes (see `apps/ws-server/src/test/transcript-gen.ts`). When the dir is empty
 * (a fresh clone), `loadFirstConvoFixture()` returns `null` and the fixture-dependent tests skip gracefully.
 * The event factories are self-contained (no fixture needed). Heavy `MessageSingleton<true>` shapes are produced
 * by CLONING a real fixture message (`cloneMessage`) rather than hand-building ~22 fields.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  AIChatChunk,
  AIChatError,
  AIChatRequest,
  AIChatResponse,
  ChatChunkAndResMsgBlock,
  ConversationSingleton,
  MessageSingleton
} from "@slipstream/types";

const FIXTURE_DIR = fileURLToPath(new URL("./__fixtures__", import.meta.url));

export function fixtureFilenames() {
  if (!existsSync(FIXTURE_DIR)) return Array.of<string>();
  return readdirSync(FIXTURE_DIR).filter(name => name.endsWith(".json"));
}

/** Load a convo dump as a `ConversationSingleton<true>`, backfilling a numeric `ordinal` per message if absent. */
export function loadConvoFixture(filename: string) {
  const raw = readFileSync(`${FIXTURE_DIR}/${filename}`, "utf8");
  const convo = JSON.parse<ConversationSingleton<true>>(raw);
  const messages = convo.messages.map((message, index) => ({
    ...message,
    ordinal: typeof message.ordinal === "number" ? message.ordinal : index
  }));
  return { ...convo, messages } satisfies ConversationSingleton<true>;
}

export function loadFirstConvoFixture() {
  const [first] = fixtureFilenames();
  return first ? loadConvoFixture(first) : null;
}

/** Clone a real fixture message with overrides — avoids hand-building the full `MessageSingleton<true>` shape. */
export function cloneMessage(
  base: MessageSingleton<true>,
  overrides: Partial<MessageSingleton<true>>
) {
  return { ...base, ...overrides } satisfies MessageSingleton<true>;
}

export function makeBlock(
  conversationId: string,
  ordinal: number,
  content: string,
  type: ChatChunkAndResMsgBlock["type"] = "TEXT"
) {
  return {
    type,
    content,
    ordinal,
    conversationId,
    durationMs: 0
  } satisfies ChatChunkAndResMsgBlock;
}

export function makeRequest(
  conversationId: string,
  overrides: Partial<AIChatRequest> = {}
) {
  return {
    type: "ai_chat_request",
    conversationId,
    prompt: "test prompt",
    provider: "openai",
    ...overrides
  } satisfies AIChatRequest;
}

export function makeChunk(
  conversationId: string,
  overrides: Partial<AIChatChunk> = {}
) {
  return {
    type: "ai_chat_chunk",
    conversationId,
    userMsgId: "user-temp",
    userId: "user-1",
    done: false,
    ...overrides
  } satisfies AIChatChunk;
}

/** Build an `ai_chat_response` around a `[ai, user]` convo (the server's `take:2, createdAt desc` contract). */
export function makeResponse(
  convo: ConversationSingleton<true>,
  overrides: Partial<AIChatResponse> = {}
) {
  return {
    type: "ai_chat_response",
    conversationId: convo.id,
    userMsgId: convo.messages.at(1)?.id ?? "user-temp",
    userId: "user-1",
    done: true,
    chunk: "",
    convo,
    aiMsgId: convo.messages.at(0)?.id,
    ...overrides
  } satisfies AIChatResponse;
}

export function makeError(
  conversationId: string,
  message: string,
  overrides: Partial<AIChatError> = {}
) {
  return {
    type: "ai_chat_error",
    conversationId,
    userMsgId: "user-temp",
    userId: "user-1",
    done: true,
    message,
    ...overrides
  } satisfies AIChatError;
}
