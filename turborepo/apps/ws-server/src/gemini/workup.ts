import type {
  GeminiEventMap,
  GenerateContentResponseProps
} from "@/gemini/types.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { FileSearchToolInput } from "@/store/types.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type {
  Content,
  ContentUnion,
  FunctionDeclaration,
  GenerateContentConfig,
  GenerateContentParameters,
  Part,
  PartMediaResolution,
  ToolConfig
} from "@google/genai";
import { FileSearchStoreService } from "@/gemini/fss.ts";
import {
  GoogleGenAI,
  Interactions,
  PartMediaResolutionLevel,
  ThinkingLevel,
  Type
} from "@google/genai";
import type {
  AttachmentSingleton,
  CTR,
  GeminiModelIdUnion,
  MessageSingleton
} from "@slipstream/types";

export class GeminiWorkupService extends FileSearchStoreService {
  protected nanoid: Promise<(typeof import("nanoid"))["nanoid"]>;
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    protected store: UserStoreVectorService,
    apiKey: string
  ) {
    super(logger, prisma, apiKey);
    this.nanoid = import("nanoid").then(d => d.nanoid);
  }
  /**
   * gemini-3-* only
   */
  private mediaResolutionLevel(mimeType?: string) {
    if (!mimeType)
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_UNSPECIFIED
      } satisfies PartMediaResolution;
    else if (mimeType === "application/pdf") {
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM
      } satisfies PartMediaResolution;
    } else if (mimeType.startsWith("image/")) {
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH
      } satisfies PartMediaResolution;
    } else if (mimeType.startsWith("video/")) {
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM
      } satisfies PartMediaResolution;
    } else if (
      mimeType.startsWith("text/") ||
      mimeType.startsWith("application/")
    ) {
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM
      } satisfies PartMediaResolution;
    } else
      return {
        level: PartMediaResolutionLevel.MEDIA_RESOLUTION_UNSPECIFIED
      } satisfies PartMediaResolution;
  }
  protected async *resilientStream(
    gemini: GoogleGenAI,
    params: Interactions.CreateAgentInteractionParamsStreaming,
    interactionId?: string,
    lastEventId?: string
  ): AsyncGenerator<Interactions.InteractionSSEEvent> {
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        const stream = interactionId
          ? await gemini.interactions.get(
              interactionId,
              {
                stream: true,
                api_version: "v1alpha",
                last_event_id: lastEventId
              },
              { stream: true }
            )
          : await gemini.interactions.create(params, { stream: true });

        for await (const event of stream) {
          yield event;
          if (event.event_id) lastEventId = event.event_id;
          if (event.event_type === "interaction.start") {
            interactionId = event.interaction?.id;
          }
        }
        return; // Completed successfully
      } catch (err) {
        attempts++;
        this.logger.warn(
          { err, attempts, interactionId, lastEventId },
          "deep_research_stream_interrupted"
        );
        await this.prisma.extractor.wait(2000 * attempts); // Exponential backoff
      }
    }

    throw new Error(
      `Failed to complete research after ${maxAttempts} attempts`
    );
  }

  protected interactionsHandler = <
    const K extends keyof GeminiEventMap = keyof GeminiEventMap
  >(
    event: K,
    handler: (data: GeminiEventMap[K]) => void
  ) => ({ event, handler });

  protected getPreviousInteractionId(msgs: MessageSingleton<true>[]) {
    // Find the last message from the AI that used the Deep Research model
    const lastResearchIndex = msgs.findLastIndex(
      m =>
        m.provider === "GEMINI" &&
        m.senderType === "AI" &&
        m.model === "deep-research-pro-preview-12-2025" &&
        m.responseOutput &&
        m.responseOutput.length > 0
    );

    if (lastResearchIndex !== -1) {
      // Return the stored Interaction ID
      return msgs[lastResearchIndex]?.responseOutput ?? undefined;
    }

    return undefined;
  }

  protected async formatHistoryForDeepResearch(
    msgs: MessageSingleton<true>[],
    keyFingerprint: string,
    keyId?: string,
    apiKey?: string
  ): Promise<Interactions.Turn[]> {
    const formattedTurns = Array.of<Interactions.Turn>();

    for (const msg of msgs) {
      const role = msg.senderType === "USER" ? "user" : "model";
      const contentItems =
        Array.of<
          Exclude<CTR<Interactions.Turn, "content">["content"], string>[number]
        >();
      if (msg.attachments && msg.attachments.length > 0) {
        for (const attachment of msg.attachments) {
          try {
            if (
              attachment?.compatCdnUrl &&
              attachment?.cdnUrl &&
              attachment?.mime &&
              attachment?.compatMime &&
              attachment?.compatStatus
            ) {
              const { fileUri, mimeType } = await this.ensureAssetUploaded(
                attachment,
                keyFingerprint,
                keyId ?? undefined,
                apiKey
              );

              // Switch on your Enum for strict typing
              switch (attachment.assetType) {
                case "IMAGE":
                  contentItems.push({
                    type: "image",
                    uri: fileUri,
                    mime_type: mimeType as
                      | "image/png"
                      | "image/jpeg"
                      | "image/webp"
                      | "image/heic"
                      | "image/heif"
                  });
                  break;

                case "DOCUMENT":
                  contentItems.push({
                    type: "document",
                    uri: fileUri,
                    mime_type: mimeType as "application/pdf"
                  });
                  break;

                case "VIDEO":
                  // Note: Deep Research docs didn't explicitly forbid video, only audio.
                  // If the underlying model (Gemini 3) supports it, this is how you pass it.
                  contentItems.push({
                    type: "video",
                    uri: fileUri,
                    mime_type: mimeType as
                      | "video/mp4"
                      | "video/mpeg"
                      | "video/mpg"
                      | "video/mov"
                      | "video/avi"
                      | "video/x-flv"
                      | "video/webm"
                      | "video/wmv"
                      | "video/3gpp"
                  });
                  break;

                case "AUDIO":
                case "UNKNOWN":
                default:
                  // Deep Research currently docs state: "Audio inputs are not supported."
                  this.logger.warn(
                    `Skipping unsupported asset type for Deep Research: ${attachment.assetType}`
                  );
                  break;
              }
            }
          } catch (err) {
            this.logger.warn(
              `Error preparing attachment ${attachment.id}: ${this.prisma.safeErrMsg(err)}`
            );
          }
        }
      }

      let textContent = msg.content;
      if (msg.senderType === "AI") {
        const modelIdentifier = `[${msg.provider.toLowerCase()}/${msg.model ?? "unknown"}]`;
        textContent = `${modelIdentifier}\n${msg.content}`;
      }

      contentItems.push({
        type: "text",
        text: textContent
      });

      formattedTurns.push({ content: contentItems, role });
    }

    return formattedTurns;
  }

  protected async formatHistoryForSession(
    msgs: MessageSingleton<true>[],
    keyFingerprint: string,
    keyId?: string,
    apiKey?: string,
    m: GeminiModelIdUnion = "gemini-3.1-pro-preview"
  ) {
    const formatted = Array.of<Content>();
    for (const msg of msgs) {
      if (msg.senderType === "USER") {
        const partArr = Array.of<Part>();
        if (msg.attachments.length > 0) {
          for (const attachment of msg.attachments) {
            try {
              if (
                attachment?.compatCdnUrl &&
                attachment?.cdnUrl &&
                attachment?.mime &&
                attachment?.compatMime &&
                attachment?.compatStatus
              ) {
                if (
                  m === "gemini-3.1-pro-preview" ||
                  m === "gemini-3.1-pro-preview-customtools" ||
                  m === "gemini-3.1-flash-lite-preview"
                ) {
                  const { fileUri, mimeType } = await this.ensureAssetUploaded(
                    attachment,
                    keyFingerprint,
                    keyId ?? undefined,
                    apiKey
                  );
                  partArr.push({
                    fileData: { fileUri, mimeType },
                    mediaResolution: this.mediaResolutionLevel(mimeType)
                  });
                } else {
                  const { fileUri, mimeType } = await this.ensureAssetUploaded(
                    attachment,
                    keyFingerprint,
                    keyId ?? undefined,
                    apiKey
                  );
                  partArr.push({
                    fileData: { fileUri, mimeType }
                  });
                }
              }
            } catch (err) {
              this.logger.warn(
                "error in gemini attachment upload: " +
                  this.prisma.safeErrMsg(err)
              );
            }
          }
        }
        const blockAgg = Array.of<string>();
        if (msg.messageBlocks && msg.messageBlocks.length > 0) {
          for (const block of msg.messageBlocks) {
            if (block.type === "TEXT") {
              blockAgg.push(block.content);
            }
          }
        }
        if (blockAgg.length > 0) {
          partArr.push({ text: blockAgg.join(`\n`) });
        } else {
          partArr.push({ text: msg.content });
        }
        formatted.push({ role: "user", parts: partArr } as const);
      } else {
        // AI message - may have AI-generated attachments
        const partArr = Array.of<Part>();
        const model = msg.model ?? "unknown";
        const modelIdentifier = `[${msg.provider.toLowerCase()}/${model}]`;

        // Handle AI-generated attachments if they exist
        if (
          msg.attachments &&
          msg.attachments.length > 0 &&
          msg.senderType === "AI"
        ) {
          for (const attachment of msg.attachments) {
            try {
              // AI-generated assets should have these fields populated
              if (
                attachment?.cdnUrl &&
                attachment?.mime &&
                attachment.origin === "GENERATED"
              ) {
                const { fileUri, mimeType } = await this.ensureAssetUploaded(
                  attachment,
                  keyFingerprint,
                  keyId,
                  apiKey
                );
                partArr.push({
                  fileData: { fileUri, mimeType }
                });
              }
            } catch (err) {
              this.logger.warn(
                `Error uploading AI-generated attachment in history: ${attachment.id} - ${this.prisma.safeErrMsg(err)}`
              );
            }
          }
        }
        const blockAgg = Array.of<string>();
        if (msg.messageBlocks && msg.messageBlocks.length > 0) {
          for (const block of msg.messageBlocks) {
            if (block.type === "TEXT") {
              blockAgg.push(block.content);
            }
          }
        }
        if (blockAgg.length > 0) {
          partArr.push({ text: `${modelIdentifier}\n${blockAgg.join(`\n`)}` });
        } else {
          partArr.push({ text: `${modelIdentifier}\n${msg.content}` });
        }
        formatted.push({
          role: "model",
          parts: partArr
        } as const);
      }
    }
    return formatted;
  }

  protected formatSystemInstruction(isNewChat: boolean, systemPrompt?: string) {
    if (isNewChat) {
      return systemPrompt;
    }

    const note =
      "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";

    return (
      systemPrompt ? `${systemPrompt}\n\n${note}` : note
    ) satisfies ContentUnion;
  }

  protected async getHistoryAndInstruction(
    isNewChat: boolean,
    msgs: MessageSingleton<true>[],
    keyFingerprint: string,
    systemPrompt?: string,
    keyId?: string,
    apiKey?: string,
    model?: GeminiModelIdUnion
  ) {
    const systemInstruction = this.formatSystemInstruction(
      isNewChat,
      systemPrompt
    );

    const history = await this.formatHistoryForSession(
      msgs,
      keyFingerprint,
      keyId,
      apiKey,
      model
    );
    return {
      history,
      systemInstruction
    };
  }

  private async ensureAssetUploaded(
    attachment: AttachmentSingleton<true>,
    keyFingerprint: string,
    keyId?: string,
    apiKey?: string
  ) {
    // Use Google Files API naming convention for cache key and registry key
    const fileKey = `files/${attachment.id}`;
    const now = new Date();

    const fssRef = this.fssRegistry.get(attachment.userId) ?? "";
    const storeDbId = this.storeDbRegistry.get(attachment.userId) ?? "";
    // Check in-memory cache AND verify file exists in registry
    const cached = this.assetCache.get(fileKey);
    if (cached && new Date(cached.expiresAt).getTime() > now.getTime()) {
      // Verify the file still exists in the authoritative registry
      const registryEntry = this.fileRegistry.get(fileKey);
      if (registryEntry?.expirationTime) {
        // Also verify the registry entry hasn't expired
        const registryExpiry = new Date(registryEntry.expirationTime).getTime();
        if (registryExpiry > now.getTime()) {
          this.logger.debug(
            {
              fileKey,
              registryState: registryEntry.state,
              registryExpiry: registryEntry.expirationTime,
              cacheExpiry: cached.expiresAt
            },
            `Reusing cached & verified Gemini file: ${attachment.id}`
          );
          return {
            fileUri: cached.fileUri,
            mimeType:
              (attachment?.compatStatus === "ALIASED"
                ? attachment.mime
                : attachment.compatMime) ?? "application/octet-stream"
          };
        } else {
          // File has expired in registry
          this.logger.warn(
            { fileKey, expiredAt: registryEntry.expirationTime },
            "Registry file has expired, clearing cache and re-uploading"
          );
          this.assetCache.delete(fileKey);
          this.fileRegistry.delete(fileKey);
        }
      } else {
        // File not in registry, clear from cache as it may have been deleted
        this.logger.warn(
          { fileKey },
          "Cached file not found in registry, clearing cache entry"
        );
        this.assetCache.delete(fileKey);
      }
    }

    // Check if file already exists in registry (avoids unnecessary upload)
    const existingInRegistry = this.fileRegistry.get(fileKey);
    if (
      existingInRegistry?.name &&
      existingInRegistry?.state?.includes("ACTIVE") &&
      existingInRegistry.uri &&
      existingInRegistry.expirationTime &&
      existingInRegistry.sizeBytes &&
      existingInRegistry.mimeType &&
      existingInRegistry.createTime
    ) {
      const expiresAt = new Date(existingInRegistry.expirationTime);

      // Verify not expired
      if (expiresAt.getTime() > now.getTime()) {
        // Create database mapping for existing file
        const d = await this.prisma.upsertGeminiAssetMapping(
          attachment.id,
          keyFingerprint,
          existingInRegistry.mimeType,
          existingInRegistry.name,
          existingInRegistry.uri,
          existingInRegistry.expirationTime,
          keyId,
          BigInt(Number.parseInt(existingInRegistry.sizeBytes)),
          existingInRegistry.createTime
        );
        this.assetCache.set(fileKey, {
          fileUri: existingInRegistry.uri,
          expiresAt,
          storeDbId,
          storeRef: fssRef,
          databaseId: d.id
        });
        this.logger.debug(
          { fileKey, state: existingInRegistry.state },
          `Found file in registry, skipping upload: files/${attachment.id}`
        );
        if (attachment.assetType === "DOCUMENT" && fssRef) {
          if (!this.fssDocRegistry.has(fileKey)) {
            void this.indexFssDocWithGoogle(attachment, apiKey).catch(err => {
              this.logger.warn(
                {
                  attachmentId: attachment.id,
                  err: this.prisma.safeErrMsg(err)
                },
                "Background FSS indexing failed for cached ephemeral file"
              );
            });
          }
        }
        return {
          fileUri: existingInRegistry.uri,
          mimeType: existingInRegistry.mimeType
        };
      }
    }

    // Upload file and store in DB with proper error handling
    try {
      const uploadedFile = await this.uploadRemoteAssetToGoogle(
        attachment,
        apiKey
      );

      if (
        !uploadedFile.uri ||
        !uploadedFile.name ||
        !uploadedFile.expirationTime ||
        !uploadedFile.sizeBytes ||
        !uploadedFile.mimeType ||
        !uploadedFile.createTime
      ) {
        throw new Error("Incomplete file upload response from Google");
      }

      // Create database mapping after successful upload
      const dbRecord = await this.prisma.upsertGeminiAssetMapping(
        attachment.id,
        keyFingerprint,
        uploadedFile.mimeType,
        uploadedFile.name,
        uploadedFile.uri,
        uploadedFile.expirationTime,
        keyId,
        BigInt(Number.parseInt(uploadedFile.sizeBytes)),
        uploadedFile.createTime
      );

      // Update in-memory cache
      this.assetCache.set(fileKey, {
        fileUri: uploadedFile.uri,
        storeRef: fssRef,
        storeDbId,
        expiresAt: new Date(uploadedFile.expirationTime),
        databaseId: dbRecord.id
      });

      // Add to registry with all file metadata
      this.fileRegistry.set(uploadedFile.name, uploadedFile);

      this.logger.info(
        { dbRecordId: dbRecord.id, fileKey: uploadedFile.name },
        `Uploaded to Google Files API: ${uploadedFile.displayName}`
      );

      return {
        fileUri: uploadedFile.uri,
        mimeType: uploadedFile.mimeType
      };
    } catch (error) {
      this.logger.error(
        { error, attachmentId: attachment.id },
        "Failed to upload file to Google Files API"
      );
      throw new Error(this.prisma.safeErrMsg(error));
    }
  }

  private mediaModalities(model: GeminiModelIdUnion) {
    if (!this.prisma.geminiNanoBananasModel(model)) {
      return ["TEXT"];
    } else return ["TEXT", "IMAGE"];
  }

  private candidateCount(model: GeminiModelIdUnion, n = 1) {
    if (!this.prisma.geminiNanoBananasModel(model)) {
      return undefined;
    } else return this.prisma.handleImgGenCount(model, { n });
  }

  protected userStoreSearchTool() {
    return {
      name: "user_store_search",
      description:
        "This tool utilizes a 'Partitioned Foraging' approach which recognizes that for the 200,000+ years that humans have existed " +
        "95%+ of it has been as foragers. Agents are trained exclusively on data aggregated/curated by humans; " +
        "think of it as agentic foraging complete with Jaccard similarity scores for cross-analyzing your bounties. " +
        "Search the user's uploaded documents. The tool uses semantic similarity by default. " +
        "When search_terms is provided, the tool also performs fulltext keyword search and returns " +
        "both result sets separately (semantic + fulltext) so you can reason about which signal " +
        "is most relevant to the user's intent. " +
        "Without search_terms: returns a flat JSON array of chunks. " +
        "With search_terms: returns { semantic: [...], fulltext: [...], overlap: { chunkIds, jaccardSimilarity }, meta }. " +
        "Use as liberally or conservatively as you see fit.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "The semantic search query"
          },
          max_results: {
            type: Type.NUMBER,
            description: "Maximum results to return (1-10, default 5)"
          },
          filename: {
            type: Type.STRING,
            description:
              "Optional filename filter (fuzzy, case-insensitive). " +
              "Only chunks from documents whose filename closely matches this string are returned. " +
              "Example: 'Path to Hell Pt VIII' matches 'The-Path-to-Hell-is-Paved-with-Good-Intentions-Pt-VIII.pdf'."
          },
          search_terms: {
            type: Type.STRING,
            description:
              "Optional exact-match search terms for fulltext search. " +
              "Supports quoted phrases and negation (-deprecated). " +
              "When provided, returns partitioned semantic + fulltext results instead of a flat array."
          }
        },
        required: ["query"]
      }
    } satisfies FunctionDeclaration;
  }

  private getToolConfig(latlng?: string) {
    const [lat, lng] = this.prisma.handleLatLng(latlng);

    return {
      // allows for mixing of google tools with custom tools
      includeServerSideToolInvocations: true,
      retrievalConfig: { latLng: { latitude: lat, longitude: lng } }
    } satisfies ToolConfig;
  }

  private getTools(
    userId: string,
    m: GeminiModelIdUnion = "gemini-3.1-pro-preview"
  ) {
    switch (m) {
      case "gemini-2.5-pro":
      case "gemini-3.1-pro-preview":
      case "gemini-3.1-pro-preview-customtools":
      case "gemini-3.1-flash-lite-preview":
      case "gemini-3-flash-preview":
      case "deep-research-pro-preview-12-2025":
      case "gemini-2.5-flash":
      case "gemini-2.5-flash-lite": {
        return [
          {
            googleSearch: {},
            urlContext: {},
            functionDeclarations: [this.userStoreSearchTool()]
          }
        ] satisfies GenerateContentConfig["tools"];
      }
      case "gemini-3.1-flash-image-preview":
      case "gemini-3-pro-image-preview": {
        return [{ googleSearch: {} }] satisfies GenerateContentConfig["tools"];
      }
      case "gemini-2.5-flash-image": {
        return [] satisfies GenerateContentConfig["tools"];
      }
      case "gemini-2.0-flash": {
        return [
          {
            functionDeclarations: [this.userStoreSearchTool()]
          }
        ] satisfies GenerateContentConfig["tools"];
      }
      case "gemini-2.0-flash-lite": {
        return [
          {
            functionDeclarations: [this.userStoreSearchTool()]
          }
        ] satisfies GenerateContentConfig["tools"];
      }
      case "imagen-4.0-fast-generate-001":
      case "imagen-4.0-generate-001":
      case "imagen-4.0-ultra-generate-001":
      case "veo-2.0-generate-001":
      case "veo-3.0-fast-generate-001":
      case "veo-3.0-generate-001":
      case "veo-3.1-fast-generate-preview":
      case "veo-3.1-generate-preview":
      default: {
        return undefined satisfies GenerateContentConfig["tools"];
      }
    }
  }

  private getThinkingConfig(m: GeminiModelIdUnion = "gemini-3.1-pro-preview") {
    switch (m) {
      /**
       * gemini-3* only
       */
      case "deep-research-pro-preview-12-2025":
      case "gemini-3-flash-preview":
      case "gemini-3.1-flash-image-preview":
      case "gemini-3.1-flash-lite-preview":
      case "gemini-3.1-pro-preview":
      case "gemini-3.1-pro-preview-customtools": {
        return {
          includeThoughts: true,
          thinkingLevel: ThinkingLevel.HIGH
        } satisfies GenerateContentConfig["thinkingConfig"];
      }
      case "gemini-3-pro-image-preview":
      case "gemini-2.5-flash":
      case "gemini-2.5-flash-lite":
      case "gemini-2.5-pro": {
        return {
          includeThoughts: true,
          thinkingBudget: -1
        } satisfies GenerateContentConfig["thinkingConfig"];
      }
      case "gemini-2.0-flash":
      case "gemini-2.0-flash-lite":
      case "imagen-4.0-fast-generate-001":
      case "imagen-4.0-generate-001":
      case "imagen-4.0-ultra-generate-001":
      case "veo-2.0-generate-001":
      case "veo-3.0-fast-generate-001":
      case "veo-3.0-generate-001":
      case "veo-3.1-fast-generate-preview":
      case "veo-3.1-generate-preview":
      default: {
        return {
          includeThoughts: false,
          thinkingBudget: 0
        } satisfies GenerateContentConfig["thinkingConfig"];
      }
      case "gemini-2.5-flash-image": {
        return undefined satisfies GenerateContentConfig["thinkingConfig"];
      }
    }
  }
  protected async generateId(target: "seriesId" | "generationGroupId") {
    const nanoid = await this.nanoid;
    if (target === "generationGroupId") {
      const generationGroupId = "resp_" + nanoid();
      return generationGroupId;
    } else return nanoid();
  }

  protected async searchUserStore(
    userId: string,
    query: string,
    limit = 5,
    threshold = 0,
    filename?: string
  ) {
    return await this.store.searchUserStoreChunks({
      userId,
      query,
      limit,
      threshold,
      filename
    });
  }

  protected async searchUserStoreHybrid(
    userId: string,
    query: string,
    searchTerms: string,
    limit = 10,
    threshold = 0,
    filename?: string
  ) {
    return await this.store.searchUserStoreChunksHybrid({
      userId,
      query,
      searchTerms,
      limit,
      threshold,
      filename
    });
  }

  protected async executeUserStoreSearch(
    userId: string,
    input: FileSearchToolInput
  ) {
    const limit = Math.max(1, Math.min(input.max_results ?? 5, 10));

    if (input.search_terms) {
      const partitioned = await this.searchUserStoreHybrid(
        userId,
        input.query,
        input.search_terms,
        limit,
        0,
        input.filename
      );
      return this.store.formatPartitionedResults(partitioned, input.query);
    }

    const results = await this.searchUserStore(
      userId,
      input.query,
      limit,
      0,
      input.filename
    );

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

  private async contentGenChat({
    userId,
    isNewChat,
    keyId,
    model,
    msgs,
    apiKey,
    latlng,
    topP,
    temperature,
    max_tokens,
    systemPrompt,
    imgGenFields
  }: GenerateContentResponseProps) {
    const m = model as GeminiModelIdUnion;
    const keyFingerprint = keyId ?? "server";
    const toolConfig = this.getToolConfig(latlng);
    const tools = this.getTools(userId, m);
    const thinkingConfig = this.getThinkingConfig(m);
    const maxOutputTokens = max_tokens;
    const { history: contents, systemInstruction } =
      await this.getHistoryAndInstruction(
        isNewChat,
        msgs,
        keyFingerprint,
        systemPrompt,
        keyId ?? undefined,
        apiKey,
        m
      );
    const responseModalities = this.mediaModalities(m);
    const candidateCount = this.candidateCount(m, imgGenFields?.n);
    return {
      contents,
      model,
      config: {
        maxOutputTokens,
        toolConfig,
        // Custom Gemini tool rounds are handled explicitly in chat.ts.
        automaticFunctionCalling: { disable: true },
        responseModalities,
        tools,
        topP,
        candidateCount,
        temperature,
        systemInstruction,
        thinkingConfig
      }
    } satisfies GenerateContentParameters;
  }

  /**
   * 🍌 :3 🍌
   */
  private async contentGenNanoBananas({
    userId,
    isNewChat,
    keyId,
    model,
    msgs,
    apiKey,
    latlng,
    topP,
    temperature,
    max_tokens,
    systemPrompt,
    imgGenFields
  }: GenerateContentResponseProps) {
    const m = model as
      | "gemini-3-pro-image-preview"
      | "gemini-3.1-flash-image-preview"
      | "gemini-2.5-flash-image";

    const keyFingerprint = keyId ?? "server";
    const toolConfig = this.getToolConfig(latlng);
    const tools = this.getTools(userId, m);
    const thinkingConfig = this.getThinkingConfig(m);
    const maxOutputTokens = max_tokens;
    const { history: contents, systemInstruction } =
      await this.getHistoryAndInstruction(
        isNewChat,
        msgs,
        keyFingerprint,
        systemPrompt,
        keyId ?? undefined,
        apiKey,
        m
      );

    const out = imgGenFields?.output_size
      ? m === "gemini-3.1-flash-image-preview"
        ? this.prisma.geminiAspectRatio(m, {
            output_size: this.prisma.isValidNanoBananaGenOneAR(
              imgGenFields.output_size
            )
              ? imgGenFields.output_size
              : "16:9"
          })
        : undefined
      : undefined;

    const aspectRatio = this.prisma.handleOutputSize(m, {
      output_size: out ?? "16:9"
    });
    const imageSize = this.prisma.handleImgGenOutputQuality(m, {
      output_quality: imgGenFields?.output_quality
        ? this.prisma.isValidNanoBananaProAndTwoOutputQuality(
            imgGenFields.output_quality
          )
          ? imgGenFields.output_quality
          : m === "gemini-3.1-flash-image-preview"
            ? "2K"
            : m === "gemini-3-pro-image-preview"
              ? "2K"
              : undefined
        : undefined
    });
    const responseModalities = this.mediaModalities(m);
    const candidateCount = this.candidateCount(m, imgGenFields?.n);
    return {
      contents,
      model,
      config: {
        maxOutputTokens,
        toolConfig,
        thinkingConfig,
        responseModalities,
        tools,
        topP,
        candidateCount,
        imageConfig: { aspectRatio, imageSize },
        temperature,
        systemInstruction
      }
    } satisfies GenerateContentParameters;
  }

  protected async contentGen({
    model,
    imgGenFields,
    ...rest
  }: GenerateContentResponseProps) {
    const m = model as GeminiModelIdUnion;
    if (
      this.prisma.geminiNanoBananasModel(m) &&
      typeof imgGenFields !== "undefined"
    ) {
      return this.contentGenNanoBananas({
        model: m,
        imgGenFields: imgGenFields,
        ...rest
      });
    } else {
      return this.contentGenChat({
        model: m,
        imgGenFields: undefined,
        ...rest
      });
    }
  }
}
