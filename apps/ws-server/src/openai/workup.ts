import { createReadStream } from "node:fs";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { OpenAIFileSearchToolInput } from "@/openai/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type {
  InferPromiseRT,
  ProviderOpenaiRequestEntity
} from "@/types/index.ts";
import type { OpenAI } from "openai";
import type { ResponseInput } from "openai/resources/responses/responses.mjs";
import { OpenAIBaseService } from "@/openai/base.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  AttachmentSingleton,
  MessageSingleton,
  OpenAiModelIdUnion
} from "@slipstream/types";

export class OpenAIServiceWorkup extends OpenAIBaseService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    apiKey: string,
    s3: S3Storage,
    memoryService: ConversationMemoryVectorService
  ) {
    super(logger, prisma, userStoreVector, apiKey, s3, memoryService);
  }

  private async ensureAssetUploadedToOpenAI(
    attachment: AttachmentSingleton<true>,
    client: OpenAI,
    keyFingerprint = "server",
    keyId?: string
  ): Promise<{ file_id: string; db_id: string }> {
    // 1) Reuse if we already uploaded this asset for this key fingerprint
    const existing = await this.prisma.findActiveOpenAIAsset(
      attachment.id,
      keyFingerprint
    );
    if (existing?.providerRef) {
      // IMPORTANT: return ONLY file_id; do NOT include filename alongside file_id
      return { file_id: existing.providerRef, db_id: existing.id };
    }

    const { absTmpPath, tmpUniquename, mime } =
      await this.prisma.fetchRemoteToTmp("OPENAI", attachment);

    try {
      const uploaded = await client.files.create({
        file: createReadStream(absTmpPath),
        purpose: "user_data"
      });

      const upsert = await this.prisma.upsertOpenAIAssetMapping(
        attachment.id,
        keyFingerprint,
        mime,
        uploaded.id,
        keyId,
        BigInt(uploaded.bytes),
        new Date(uploaded.created_at * 1000).toISOString()
      );

      return { file_id: uploaded.id, db_id: upsert.id };
    } catch (err) {
      throw new Error(this.prisma.safeErrMsg(err));
    } finally {
      this.prisma.cleanupTmpPostupload("OPENAI", absTmpPath, tmpUniquename);
    }
  }
  protected async buildAttachmentContentAsync(
    attachments?: MessageSingleton<true>["attachments"],
    client?: OpenAI,
    keyFingerprint = "server"
  ) {
    const content = Array.of<
      | {
          type: "input_image";
          image_url?: string;
          file_id?: string;
          detail: "auto" | "low" | "high";
        }
      | {
          type: "input_file";
          file_id?: string;
          filename?: string;
          file_data?: string;
        }
    >();
    if (!attachments || attachments.length === 0) return content;
    if (!client) return content;

    for (const att of attachments) {
      const url = att.compatCdnUrl ?? att.cdnUrl ?? att.sourceUrl;
      const mime = att.compatMime ?? att.mime ?? "";
      if (!url) continue;

      if (mime.startsWith("image/")) {
        try {
          const { file_id } = await this.ensureAssetUploadedToOpenAI(
            att,
            client,
            keyFingerprint
          );
          content.push({ type: "input_image", file_id, detail: "auto" });
          continue;
        } catch (error) {
          this.logger.warn(
            { attachmentId: att.id, error },
            "Failed to upload image to OpenAI, falling back to base64 data URL"
          );
          const image_url = await this.encodeImageAsDataUrl(att);
          content.push({ type: "input_image", image_url, detail: "auto" });
          continue;
        }
      } else {
        const { file_id } = await this.ensureAssetUploadedToOpenAI(
          att,
          client,
          keyFingerprint
        );

        content.push({ type: "input_file", file_id });
      }
    }
    return content;
  }

  // openai/index.ts
  protected async formatOpenAiWithUploads(
    isNewChat: boolean,
    msgs: MessageSingleton<true>[],
    client: OpenAI,
    keyFingerprint = "server",
    opts?: { onlyMostRecentUser?: boolean }
  ) {
    if (isNewChat) {
      const first = msgs[0];
      if (!first)
        return [{ role: "user", content: "" }] as const satisfies ResponseInput;
      const firstText = this.messageText(first);
      const attContent = await this.buildAttachmentContentAsync(
        first.attachments,
        client,
        keyFingerprint
      );
      return attContent.length
        ? ([
            {
              role: "user",
              content: [...attContent, { type: "input_text", text: firstText }]
            }
          ] as const satisfies ResponseInput)
        : ([
            { role: "user", content: firstText }
          ] as const satisfies ResponseInput);
    } else {
      if (opts?.onlyMostRecentUser) {
        const lastUser = [...msgs].reverse().find(t => t.senderType === "USER");
        if (lastUser) {
          const lastUserText = this.messageText(lastUser);
          const attContent = await this.buildAttachmentContentAsync(
            lastUser.attachments,
            client,
            keyFingerprint
          );
          return attContent.length
            ? ([
                {
                  role: "user",
                  content: [
                    ...attContent,
                    { type: "input_text", text: lastUserText }
                  ]
                }
              ] as const satisfies ResponseInput)
            : ([
                { role: "user", content: lastUserText }
              ] as const satisfies ResponseInput);
        }
      }
      const history = this.prependProviderModelTag(msgs.slice(0, -1));
      const last = msgs.at(-1);
      if (last?.senderType === "USER") {
        const lastText = this.messageText(last);
        const attContent = await this.buildAttachmentContentAsync(
          last.attachments,
          client,
          keyFingerprint
        );
        return attContent.length
          ? ([
              ...history,
              {
                role: "user",
                content: [...attContent, { type: "input_text", text: lastText }]
              }
            ] as const satisfies ResponseInput)
          : ([
              ...history,
              { role: "user", content: lastText }
            ] as const satisfies ResponseInput);
      }
      return this.formatMsgs(this.prependProviderModelTag(msgs));
    }
  }

  protected messageText(
    msg: Pick<MessageSingleton<true>, "content" | "messageBlocks">
  ) {
    const textBlocks = Array.of<string>();

    if (msg.messageBlocks && msg.messageBlocks.length > 0) {
      for (const block of msg.messageBlocks) {
        if (block.type === "TEXT") {
          textBlocks.push(block.content);
        }
      }
    }

    if (textBlocks.length > 0) {
      return textBlocks.join("\n");
    }

    return msg.content;
  }

  private prependProviderModelTag(
    msgs: Pick<
      MessageSingleton<true>,
      "senderType" | "provider" | "model" | "content" | "messageBlocks"
    >[]
  ) {
    return msgs.map(msg => {
      const text = this.messageText(msg);

      if (msg.senderType === "USER") {
        return { role: "user", content: text } as const;
      } else {
        const provider = msg.provider.toLowerCase();
        const model = msg.model ?? "";
        const modelIdentifier = `[${provider}/${model}]`;
        return {
          role: "assistant",
          content: `${modelIdentifier} \n${text}`
        } as const;
      }
    }) satisfies ResponseInput;
  }

  protected buildInstructions(systemPrompt?: string) {
    const note =
      "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation. " +
      "Older messages of long conversations may be omitted from your view — use conversation_memory_search to recall them.";

    return systemPrompt ? `${systemPrompt}\n\n${note}` : note;
  }

  protected ensureUserVectorStoreId(
    client: OpenAI,
    workspaceId: string | null | undefined,
    userId: string
  ) {
    const name = `slipstream:${workspaceId ?? "global"}:${userId}`;

    const cached = this.vsCache.get(name);
    if (cached) return Promise.resolve(cached);

    const inflight = this.inflightVS.get(name);
    if (inflight) return inflight;

    const p = (async () => {
      try {
        // 1) Scan existing stores (auto-paginates)
        for await (const store of client.vectorStores.list({ limit: 100 })) {
          if (store.name === name) {
            this.vsCache.set(name, store.id);
            return store.id;
          }
        }

        // 2) Create once and cache
        const created = await client.vectorStores.create({ name });
        this.vsCache.set(name, created.id);
        return created.id;
      } finally {
        this.inflightVS.delete(name);
      }
    })();

    this.inflightVS.set(name, p);
    return p;
  }
  protected hasFiles(
    formatted: InferPromiseRT<ReturnType<typeof this.formatOpenAiWithUploads>>
  ) {
    return formatted.some(m => {
      if (typeof m.content === "string") return false;
      if (m.role !== "user") return false;
      return m.content.some(
        t =>
          t.type === "input_file" &&
          (typeof t?.file_id !== "undefined" ||
            typeof t?.file_data !== "undefined")
      );
    });
  }
  protected hasImages(
    formatted: InferPromiseRT<ReturnType<typeof this.formatOpenAiWithUploads>>
  ) {
    return formatted.some(m => {
      if (typeof m.content === "string") return false;
      if (m.role !== "user") return false;
      return m.content.some(
        t =>
          t.type === "input_image" &&
          (typeof t?.image_url !== "undefined" ||
            typeof t?.file_id !== "undefined")
      );
    });
  }
  protected fileIds(
    formatted: InferPromiseRT<ReturnType<typeof this.formatOpenAiWithUploads>>
  ) {
    const fileIdArr = Array.of<string>();
    try {
      for (const m of formatted) {
        if (m.role !== "user") continue;
        const c = m.content;
        if (typeof c === "string") continue;
        for (const p of c) {
          if (p.type === "input_file" && p.file_id) fileIdArr.push(p.file_id);
        }
      }
    } finally {
      return fileIdArr;
    }
  }

  protected formatMsgs(
    msgs: (
      | {
          readonly role: "user";
          readonly content: string;
        }
      | {
          readonly role: "assistant";
          readonly content: string;
        }
    )[]
  ) {
    return [...msgs] as const satisfies ResponseInput;
  }

  protected normalizeLocation(
    user_location: ProviderOpenaiRequestEntity["user_location"]
  ) {
    return (
      user_location
        ? {
            type: "approximate" as const,
            city: user_location.city ?? null,
            country: user_location.country ?? null,
            region: user_location.region ?? null,
            timezone: user_location.tz
              ? decodeURIComponent(user_location.tz)
              : null
          }
        : undefined
    ) satisfies OpenAI.Responses.WebSearchTool.UserLocation | null | undefined;
  }

  protected fileSearchFunctionTool() {
    return {
      type: "function",
      name: "file_search",
      description:
        "This tool utilizes a 'Partitioned Foraging' approach which recognizes that for the 200,000+ years that humans have existed " +
        "95%+ of it has been as foragers. Agents are trained exclusively on data aggregated/curated by humans; " +
        "think of it as agentic foraging complete with Jaccard similarity scores for cross-analyzing your bounties. " +
        "Search the user's uploaded documents. Uses semantic similarity by default. " +
        "When search_terms is provided, also performs fulltext keyword search and returns " +
        "both result sets separately (semantic + fulltext) so you can reason about which signal is most relevant. " +
        "Without search_terms: returns a flat JSON array. " +
        "With search_terms: returns { semantic, fulltext, overlap, meta }.",
      strict: false,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The semantic search query."
          },
          max_results: {
            type: "number",
            description: "Maximum results to return (1-10, default 5)"
          },
          filename: {
            type: "string",
            description:
              "Optional filename filter (fuzzy, case-insensitive). " +
              "Only chunks from documents whose filename closely matches this string are returned. " +
              "Example: 'Path to Hell Pt VIII' matches 'The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-VIII.pdf'."
          },
          search_terms: {
            type: "string",
            description:
              "Optional exact-match search terms for fulltext search. " +
              "Supports quoted phrases and negation (-deprecated). " +
              "When provided, returns partitioned semantic + fulltext results instead of a flat array."
          }
        },
        required: ["query"],
        additionalProperties: false
      }
    } as const satisfies OpenAI.Responses.FunctionTool;
  }

  protected memorySearchFunctionTool() {
    return {
      type: "function",
      name: "conversation_memory_search",
      description:
        "Search the user's indexed conversation history — older sections of this conversation and other conversations. " +
        "Sections are ~8k-token transcript slices with model-written technical summaries; summary keyword hits outrank " +
        "raw transcript hits in the fulltext lane. Semantic similarity by default; when search_terms is provided, also " +
        "performs fulltext keyword search and returns { semantic_results, fulltext_results, overlap_results, metadata }. " +
        "scope 'current_conversation' (default) reaches this conversation's older indexed sections — including messages " +
        "beyond your context window; 'all_conversations' reaches the user's entire history, with conversation_id + " +
        "conversation_title on every hit for citation. Sections are keyed by 0-based message ordinal ranges [start, end). " +
        "Expand a hit with conversation_memory_get_chunk.",
      strict: false,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The semantic search query"
          },
          search_terms: {
            type: "string",
            description:
              "Optional exact-match terms for the fulltext lane. Supports quoted phrases and negation (-deprecated)."
          },
          scope: {
            type: "string",
            enum: ["current_conversation", "all_conversations"],
            description:
              "Where to search (default current_conversation). Use all_conversations for cross-conversation recall."
          },
          max_results: {
            type: "number",
            description: "Maximum results per signal (1-10, default 5)"
          },
          threshold: {
            type: "number",
            description:
              "Cosine similarity floor for the semantic lane (default 0)"
          },
          include_transcript: {
            type: "boolean",
            description:
              "Return full section transcripts inline (default false — summaries + excerpts)"
          }
        },
        required: ["query"],
        additionalProperties: false
      }
    } as const satisfies OpenAI.Responses.FunctionTool;
  }

  protected memoryGetChunkFunctionTool() {
    return {
      type: "function",
      name: "conversation_memory_get_chunk",
      description:
        "Fetch one indexed conversation-memory section in full: by chunk_id (from a conversation_memory_search hit), " +
        "or by conversation_id + ordinal (the section covering that 0-based message ordinal). " +
        "direction walks to the adjacent previous/next section — search finds the doorway, traversal walks the room. " +
        "Returns the full transcript + summary by default, plus has_previous/has_next.",
      strict: false,
      parameters: {
        type: "object",
        properties: {
          chunk_id: {
            type: "string",
            description: "Section id from a conversation_memory_search result"
          },
          conversation_id: {
            type: "string",
            description:
              "Conversation id — pair with ordinal to fetch the covering section"
          },
          ordinal: {
            type: "number",
            description: "0-based message ordinal (pair with conversation_id)"
          },
          direction: {
            type: "string",
            enum: ["previous", "next"],
            description:
              "Optional: return the adjacent section instead of the resolved one"
          },
          include_transcript: {
            type: "boolean",
            description: "Include the full transcript (default true)"
          }
        },
        required: [],
        additionalProperties: false
      }
    } as const satisfies OpenAI.Responses.FunctionTool;
  }

  protected async searchStore(
    userId: string,
    query: string,
    limit = 5,
    threshold = 0,
    filename?: string
  ) {
    return await this.userStoreVector.searchUserStoreChunks({
      userId,
      query,
      limit,
      threshold,
      filename
    });
  }

  protected async searchStoreHybrid(
    userId: string,
    query: string,
    searchTerms: string,
    limit = 10,
    threshold = 0,
    filename?: string
  ) {
    return await this.userStoreVector.searchUserStoreChunksHybrid({
      userId,
      query,
      searchTerms,
      limit,
      threshold,
      filename
    });
  }

  protected parseFileSearchInput(
    rawArguments: string
  ): OpenAIFileSearchToolInput {
    const parsed = this.parseFileSearchArguments(rawArguments);

    if ("query" in parsed && typeof parsed.query === "string") {
      const normalized = parsed.query.trim();
      if (normalized.length > 0) {
        const maxResults =
          "max_results" in parsed && typeof parsed.max_results === "number"
            ? parsed.max_results
            : undefined;

        const filenameInput =
          "filename" in parsed && typeof parsed.filename === "string"
            ? parsed.filename.trim() || undefined
            : undefined;

        const searchTermsInput =
          "search_terms" in parsed && typeof parsed.search_terms === "string"
            ? parsed.search_terms.trim() || undefined
            : undefined;

        return {
          query: normalized,
          max_results: maxResults,
          filename: filenameInput,
          search_terms: searchTermsInput
        } satisfies OpenAIFileSearchToolInput;
      }
    }

    const queryList = Array.of<string>();
    if ("queries" in parsed && Array.isArray(parsed.queries)) {
      for (const q of parsed.queries) {
        if (typeof q !== "string") continue;
        const normalized = q.trim();
        if (normalized.length === 0) continue;
        queryList.push(normalized);
      }
    }
    const uniqueQueries = Array.from(new Set(queryList)).slice(0, 5);
    const firstQuery = uniqueQueries[0];
    if (!firstQuery) {
      throw new Error(
        `file_search input missing required "query": ${rawArguments}`
      );
    }

    const maxResults =
      "max_results" in parsed && typeof parsed.max_results === "number"
        ? parsed.max_results
        : undefined;

    const filenameInput =
      "filename" in parsed && typeof parsed.filename === "string"
        ? parsed.filename.trim() || undefined
        : undefined;

    const searchTermsInput =
      "search_terms" in parsed && typeof parsed.search_terms === "string"
        ? parsed.search_terms.trim() || undefined
        : undefined;

    return {
      queries: [firstQuery, ...uniqueQueries.slice(1)] as const,
      max_results: maxResults,
      filename: filenameInput,
      search_terms: searchTermsInput
    } satisfies OpenAIFileSearchToolInput;
  }

  protected parseFileSearchArguments(rawArguments: string) {
    const trimmed = rawArguments.trim();
    if (trimmed.length === 0) {
      return {} satisfies Record<string, unknown>;
    }

    try {
      return JSON.parse<Record<string, unknown>>(trimmed);
    } catch (error) {
      const recovered = this.extractFirstJsonObject(trimmed);
      if (!recovered) {
        throw error;
      }

      this.logger.warn(
        {
          rawArgumentsPreview: trimmed.slice(0, 300),
          recoveredPreview: recovered.slice(0, 300),
          error: this.prisma.safeErrMsg(error)
        },
        "Recovered malformed OpenAI file_search arguments"
      );
      return JSON.parse<Record<string, unknown>>(recovered);
    }
  }

  protected extractFirstJsonObject(raw: string) {
    let start = -1;
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (const [index, char] of Array.from(raw).entries()) {
      if (start === -1) {
        if (char === "{") {
          start = index;
          depth = 1;
        }
        continue;
      }

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (char === "\\") {
          isEscaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return raw.slice(start, index + 1);
        }
      }
    }

    return undefined;
  }

  protected async executeFileSearch(
    userId: string,
    input: OpenAIFileSearchToolInput
  ) {
    const maxResults = Math.max(1, Math.min(input.max_results ?? 5, 10));

    if (input.search_terms) {
      const query = "query" in input ? input.query : input.queries[0];
      const partitioned = await this.searchStoreHybrid(
        userId,
        query,
        input.search_terms,
        maxResults,
        0,
        input.filename
      );
      return this.userStoreVector.formatPartitionedResults(partitioned, query);
    }

    const results =
      "query" in input
        ? await this.searchStore(
            userId,
            input.query,
            maxResults,
            0,
            input.filename
          )
        : (
            await Promise.all(
              input.queries.map(query =>
                this.searchStore(userId, query, maxResults, 0, input.filename)
              )
            )
          ).flat();

    if (results.length === 0) {
      return "[]";
    }

    return JSON.stringify(
      results.map(r => ({
        filename: r.filename,
        score: r.score != null ? Number(r.score.toFixed(4)) : 0,
        content: r.content,
        startOffset: r.startOffset,
        endOffset: r.endOffset,
        chunkIndex: r.chunkIndex
      }))
    );
  }

  protected async executeFunctionToolCall(
    userId: string,
    conversationId: string,
    toolCall: OpenAI.Responses.ResponseFunctionToolCall
  ) {
    const toolName = toolCall.name;
    try {
      if (toolName === "file_search") {
        const input = this.parseFileSearchInput(toolCall.arguments);
        const output = await this.executeFileSearch(userId, input);
        return {
          type: "function_call_output",
          call_id: toolCall.call_id,
          output
        } as const satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
      }

      if (toolName === "conversation_memory_search") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          toolCall.arguments,
          toolName
        );
        const output = await this.memoryService.searchMemoryFromToolInput(
          userId,
          conversationId,
          parsed
        );
        return {
          type: "function_call_output",
          call_id: toolCall.call_id,
          output
        } as const satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
      }

      if (toolName === "conversation_memory_get_chunk") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          toolCall.arguments,
          toolName
        );
        const output = await this.memoryService.getMemoryChunkFromToolInput(
          userId,
          parsed
        );
        return {
          type: "function_call_output",
          call_id: toolCall.call_id,
          output
        } as const satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
      }

      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: `Unknown tool: ${toolName}`
      } as const satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
    } catch (error) {
      this.logger.error(
        {
          toolName,
          callId: toolCall.call_id,
          error: this.prisma.safeErrMsg(error)
        },
        "OpenAI function tool execution failed"
      );
      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: `${toolName} error: ${this.prisma.safeErrMsg(error)}`
      } as const satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
    }
  }

  // To continue this session, run codex resume 019b2b4a-3e12-7c90-8276-49994f1d3bd2
  protected handleTooling(
    model: OpenAiModelIdUnion,
    fileSearchEnabled: boolean,
    user_location?: OpenAI.Responses.WebSearchPreviewTool.UserLocation,
    vector_store_ids?: string[],
    imgGenEnabled = false,
    imgGen?: OpenAI.Responses.Tool.ImageGeneration,
    localFileSearchEnabled = false
  ) {
    const pureImgModel = this.canCallImageApi(model);
    // memory tools attach unconditionally — conversation memory exists
    // independently of uploaded documents
    if (localFileSearchEnabled) {
      return [
        this.fileSearchFunctionTool(),
        this.memorySearchFunctionTool(),
        this.memoryGetChunkFunctionTool(),
        {
          type: "web_search",
          user_location
        }
      ] satisfies OpenAI.Responses.Tool[];
    }
    if (fileSearchEnabled && vector_store_ids && vector_store_ids.length >= 1) {
      if (imgGenEnabled === true && imgGen && pureImgModel === false) {
        return [
          imgGen,
          {
            type: "web_search",
            user_location
          }
        ] satisfies OpenAI.Responses.Tool[];
      }
      return [
        { type: "file_search", vector_store_ids, max_num_results: 10 },
        this.memorySearchFunctionTool(),
        this.memoryGetChunkFunctionTool(),
        {
          type: "web_search",
          user_location
        }
      ] satisfies OpenAI.Responses.Tool[];
    } else {
      if (imgGenEnabled === true && imgGen && pureImgModel === false) {
        return [imgGen] satisfies OpenAI.Responses.Tool[];
      }
      return [
        this.memorySearchFunctionTool(),
        this.memoryGetChunkFunctionTool(),
        {
          type: "web_search",
          user_location
        }
      ] satisfies OpenAI.Responses.Tool[];
    }
  }
}
// To continue this session, run codex resume 019b2b4a-3e12-7c90-8276-49994f1d3bd2
