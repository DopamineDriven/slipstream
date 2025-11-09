import type {
  GenerateContentResponseProps,
  ProviderGeminiChatRequestEntity
} from "@/gemini/types.ts";
import type { MessageSingleton } from "@slipstream/types";
import type {
  Blob,
  Content,
  ContentUnion,
  File,
  FinishReason,
  GenerateContentParameters,
  GenerateContentResponse,
  Part,
  ThinkingConfig,
  ToolConfig,
  ToolListUnion
} from "@google/genai";
import type { Logger } from "pino";
import { ExtractService } from "@/extract/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { ModelService } from "@/models/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { GoogleGenAI } from "@google/genai";
import type { CompatStatus } from "@slipstream/db/enums-node";
import type { EventTypeMap, GeminiModelIdUnion } from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";

export class GeminiService extends ModelService {
  private defaultClient: GoogleGenAI;
  private logger: Logger;
  private apiVersion = "v1alpha" as const;
  // Simple in-memory cache for the session/lifecycle
  private assetCache = new Map<string, { fileUri: string; expiresAt: Date }>();

  // private googleFilesList = new Map<string, {}>();
  constructor(
    logger: LoggerService,
    private prisma: PrismaService,
    private redis: EnhancedRedisPubSub,
    private extractor: ExtractService,
    private apiKey: string
  ) {
    super();
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[gemini] " }
      );
    this.defaultClient = new GoogleGenAI({
      apiKey: this.apiKey,
      apiVersion: this.apiVersion
    });
  }

  public getClient(overrideKey?: string) {
    if (overrideKey) {
      return new GoogleGenAI({
        apiKey: overrideKey,
        apiVersion: this.apiVersion
      });
    }
    return this.defaultClient;
  }

  private handleNumBigIntUnion(size: number | bigint) {
    return typeof size === "bigint" ? 10n * 1024n * 1024n : 10 * 1024 * 1024;
  }

  private async getSizeBytes(url: string, size: number | bigint | null) {
    if (size === null || size === 0) {
      const meta = await this.extractor.extractRemote(url, 4096 * 36);
      return meta.byteSize ?? 0;
    } else return size;
  }

  public async fetchAssetForGenAI(
    url: string,
    sizeBytes: number | bigint | null,
    mime: string | null
  ) {
    const knownSizeBytes = await this.getSizeBytes(url, sizeBytes);

    const TEN_MB = this.handleNumBigIntUnion(knownSizeBytes);

    const mimeType = mime ?? "application/octet-stream";

    const response = await fetch(url, { method: "GET" });
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch asset: ${response.statusText}`);
    }

    let buffer: Buffer<ArrayBuffer>;

    if (knownSizeBytes < TEN_MB) {
      // For smaller files, buffer them into memory directly.
      buffer = await this.streamToBuffer(response.body);
    } else {
      // For larger files, this approach is still memory-efficient.
      // The logic is the same, but you could add progress indicators here if needed.
      buffer = await this.streamToBuffer(response.body);
    }

    return { buffer, mimeType };
  }

  public async uploadRemoteAssetToGoogle(
    attachment: {
      compatCdnUrl: string | null;
      compatMime: string | null;
      cdnUrl: string | null;
      filename: string | null;
      mime: string | null;
      size: number | bigint | null;
      id: string;
    },
    apiKey?: string
  ) {
    try {
      const url = attachment.compatCdnUrl ?? attachment.cdnUrl ?? "";
      // 1. Fetch the remote file and get its buffer
      const { buffer, mimeType } = await this.fetchAssetForGenAI(
        url,
        attachment.size ?? 0,
        attachment.mime
      );

      // 2. Upload the buffer to Google's File API
      const ai = this.getClient(apiKey);
      const deterministicName = attachment.id;

      // Preflight: if file already exists, reuse it
      try {
        const existing = await this.getFileByName(
          `files/${deterministicName}`,
          apiKey
        );
        if (existing?.state?.includes("ACTIVE") && existing.uri) {
          return existing;
        }
      } catch {
        // 404 / not found is expected here, proceed to upload
      }

      const uploadedFile = await ai.files.upload({
        file: new Blob([buffer]),
        config: {
          mimeType,
          name: deterministicName,
          displayName: attachment.filename ?? undefined
        }
      });

      return uploadedFile;
    } catch (error) {
      this.logger.error(
        `Error in uploadRemoteAssetToGoogle for attachment: ${attachment.id} ` +
          this.safeErrMsg(error)
      );
      throw new Error(
        error instanceof Error
          ? error.message
          : "something went wrong in upload remote asset to google..."
      );
    }
  }

  private async streamToBuffer(stream: ReadableStream<Uint8Array>) {
    // The logic from your `assetToBufferView` is already quite efficient
    // for converting a stream to a single buffer in memory.
    const reader = stream.getReader();
    const chunks = Array.of<Uint8Array>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks);
  }

  private async formatHistoryForSession(
    msgs: MessageSingleton<true>[],
    keyFingerprint: string,
    keyId?: string,
    apiKey?: string
  ) {
    const formatted = Array.of<Content>();

    for (const msg of msgs) {
      if (msg.senderType === "USER") {
        const partArr = Array.of<Part>();
        if (msg.attachments.length > 0) {
          for (const attachment of msg.attachments) {
            try {
              if (
                attachment?.cdnUrl &&
                attachment?.mime &&
                attachment.compatStatus
              ) {
                const { fileUri, mimeType } = await this.ensureAssetUploaded(
                  {
                    cdnUrl: attachment.cdnUrl,
                    compatCdnUrl: attachment.compatCdnUrl,
                    compatMime: attachment.compatMime,
                    size: attachment.size,
                    filename: attachment.filename,
                    compatStatus: attachment.compatStatus,
                    id: attachment.id,
                    mime: attachment.mime
                  },
                  keyFingerprint,
                  keyId ?? undefined,
                  apiKey
                );
                partArr.push({
                  fileData: { fileUri, mimeType }
                });
              }
            } catch (err) {
              this.logger.warn(
                "error in gemini attachment upload: " + this.safeErrMsg(err)
              );
            }
          }
        }
        partArr.push({ text: msg.content });
        formatted.push({ role: "user", parts: partArr } as const);
      } else {
        // AI message - may have AI-generated attachments
        const partArr = Array.of<Part>();
        const provider = msg.provider.toLowerCase();
        const model = msg.model ?? "unknown";
        const modelIdentifier = `[${provider}/${model}]`;

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
                  {
                    cdnUrl: attachment.cdnUrl,
                    compatCdnUrl: attachment.compatCdnUrl,
                    compatMime: attachment.compatMime,
                    filename: attachment.filename,
                    size: attachment.size,
                    compatStatus: attachment.compatStatus ?? "ALIASED",
                    id: attachment.id,
                    mime: attachment.mime
                  },
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
                `Error uploading AI-generated attachment in history: ${attachment.id} - ${this.safeErrMsg(err)}`
              );
            }
          }
        }

        partArr.push({
          text: `${modelIdentifier}\n${msg.content}`
        });

        formatted.push({
          role: "model",
          parts: partArr
        } as const);
      }
    }
    return formatted;
  }

  private formatSystemInstruction(isNewChat: boolean, systemPrompt?: string) {
    if (isNewChat) {
      return systemPrompt;
    }

    const note =
      "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";

    return (
      systemPrompt ? `${systemPrompt}\n\n${note}` : note
    ) satisfies ContentUnion;
  }

  public async getHistoryAndInstruction(
    isNewChat: boolean,
    msgs: MessageSingleton<true>[],
    keyFingerprint: string,
    systemPrompt?: string,
    keyId?: string,
    apiKey?: string
  ) {
    const systemInstruction = this.formatSystemInstruction(
      isNewChat,
      systemPrompt
    );

    const history = await this.formatHistoryForSession(
      msgs,
      keyFingerprint,
      keyId,
      apiKey
    );
    return {
      history,
      systemInstruction
    };
  }

  private async getFileByName(name: string, apiKey?: string) {
    const ai = this.getClient(apiKey);
    if (!name.startsWith("files/") && !name.includes("/")) {
      return await ai.files.get({
        name: `files/${name}`
      });
    }
    return await ai.files.get({
      name
    });
  }

  private async checkPrisma(keyFingerprint: string) {
    return await this.prisma.getGeminiProviderAttachments(keyFingerprint);
  }

  private async ensureAssetUploaded(
    attachment: {
      cdnUrl: string | null;
      compatCdnUrl: string | null;
      compatStatus: CompatStatus;
      compatMime: string | null;
      filename: string | null;
      mime: string | null;
      size: number | bigint | null;
      id: string;
    },
    keyFingerprint: string,
    keyId?: string,
    apiKey?: string
  ) {
    const cacheKey = `${keyFingerprint}:${attachment.id}`;
    const now = new Date();
    // 0. Check in-memory cache first
    const cached = this.assetCache.get(cacheKey);

    const checkPrisma = await this.checkPrisma(keyFingerprint);

    if (
      cached &&
      checkPrisma.includes(cached.fileUri) &&
      new Date(cached.expiresAt).getTime() > now.getTime()
    ) {
      this.logger.info(`Reusing cached Gemini asset: ${attachment.id}`);
      return {
        fileUri: cached.fileUri,
        mimeType:
          (attachment?.compatStatus === "ALIASED"
            ? attachment.mime
            : attachment.compatMime) ?? "application/octet-stream"
      };
    }

    // Check if already uploaded
    const existing = await this.prisma.findActiveGeminiAsset(
      attachment.id,
      keyFingerprint
    );

    if (existing?.providerUri) {
      this.logger.info(`Reusing Gemini asset: ${attachment.id}`);
      // hydrate cache from DB
      if (existing.expiresAt) {
        this.assetCache.set(cacheKey, {
          fileUri: existing.providerUri,
          expiresAt: existing.expiresAt
        });
      }
      return {
        fileUri: existing.providerUri,
        mimeType: existing.mime ?? "application/octet-stream"
      };
    }

    // Create or update mapping to PENDING (acts as lock)
    const mapping = await this.prisma.upsertGeminiAssetMapping(
      attachment.id,
      keyFingerprint,
      attachment.compatMime ?? attachment.mime ?? "application/octet-stream",
      keyId
    );

    try {
      // Preflight: attempt to find on Google before uploading
      try {
        const name = attachment.id;
        const existing = await this.getFileByName(`files/${name}`, apiKey);
        if (
          existing?.state?.includes("ACTIVE") &&
          existing.uri &&
          existing.name &&
          existing.expirationTime &&
          existing.sizeBytes
        ) {
          const expiresAt = new Date(existing.expirationTime);
          await this.prisma.finalizeGeminiAsset(
            mapping.id,
            existing.uri,
            existing.name,
            expiresAt,
            Number.parseInt(existing.sizeBytes)
          );
          this.assetCache.set(cacheKey, { fileUri: existing.uri, expiresAt });
          return {
            fileUri: existing.uri,
            mimeType: attachment.mime ?? "application/octet-stream"
          };
        }
      } catch {
        // Not found, continue to upload
      }

      // Upload using deterministic naming (attachment.id only)
      let uploadedFile: File;
      try {
        uploadedFile = await this.uploadRemoteAssetToGoogle(attachment, apiKey);
      } catch (e) {
        const msg = this.safeErrMsg(e);
        // If Google complains the file already exists, try to fetch it and proceed
        if (
          /ALREADY_EXISTS|exists/i.test(msg) ||
          /already\s+exists/i.test(msg)
        ) {
          const name = `files/${attachment.id}`;
          const existing = await this.getFileByName(name, apiKey);
          if (existing?.uri) {
            uploadedFile = existing;
          } else {
            throw new Error(this.safeErrMsg(e));
          }
        } else {
          throw new Error(this.safeErrMsg(e));
        }
      }

      if (
        uploadedFile.uri &&
        uploadedFile.name &&
        uploadedFile.expirationTime &&
        uploadedFile.mimeType &&
        uploadedFile.sizeBytes
      ) {
        await this.prisma.finalizeGeminiAsset(
          mapping.id,
          uploadedFile.uri,
          uploadedFile.name,
          new Date(uploadedFile.expirationTime),
          Number.parseInt(uploadedFile.sizeBytes)
        );

        // Update in-memory cache
        this.assetCache.set(cacheKey, {
          fileUri: uploadedFile.uri,
          expiresAt: new Date(uploadedFile.expirationTime)
        });

        return {
          fileUri: uploadedFile.uri,
          mimeType: uploadedFile.mimeType
        };
      }

      return {
        fileUri: uploadedFile.uri ?? "",
        mimeType: attachment.mime ?? "application/octet-stream"
      };
    } catch (error) {
      await this.prisma.markGeminiAssetFailed(
        mapping.id,
        this.safeErrMsg(error)
      );
      throw new Error(
        error instanceof Error ? error.message : JSON.stringify(error, null, 2)
      );
    }
  }

  private mediaModalities(model: GeminiModelIdUnion) {
    if (!(model === "gemini-2.5-flash-image")) {
      return ["TEXT"];
    } else return ["TEXT", "IMAGE"];
  }

  private candidateCount(model: GeminiModelIdUnion, n = 1) {
    if (!(model === "gemini-2.5-flash-image")) {
      return undefined;
    } else return this.handleImgGenCount("gemini", model, { n });
  }

  private getToolConfig(latlng?: string) {
    const [lat, lng] = this.handleLatLng(latlng);

    return {
      retrievalConfig: { latLng: { latitude: lat, longitude: lng } }
    } satisfies ToolConfig;
  }

  private getTools() {
    return [{ googleSearch: {} }, { urlContext: {} }] satisfies ToolListUnion;
  }

  private getThinkingConfig() {
    return {
      includeThoughts: true,
      thinkingBudget: -1
    } satisfies ThinkingConfig;
  }

  private async contentGen({
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
    const tools = this.getTools();
    const thinkingConfig = this.getThinkingConfig();
    const maxOutputTokens = max_tokens;
    const { history: contents, systemInstruction } =
      await this.getHistoryAndInstruction(
        isNewChat,
        msgs,
        keyFingerprint,
        systemPrompt,
        keyId ?? undefined,
        apiKey
      );
    const responseModalities = this.mediaModalities(m);
    const candidateCount = this.candidateCount(m, imgGenFields?.n);
    return {
      contents,
      model,
      config: {
        maxOutputTokens,
        toolConfig,
        responseModalities,
        tools,
        topP,
        candidateCount,
        // imageConfig: { aspectRatio: "21:9" },
        temperature,
        systemInstruction,
        thinkingConfig
      }
    } satisfies GenerateContentParameters;
  }

  public async handleGeminiAiChatRequest({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    streamChannel,
    thinkingChunks,
    userId,
    ws,
    keyId,
    apiKey,
    max_tokens,
    model = "gemini-2.5-pro" satisfies GeminiModelIdUnion,
    systemPrompt,
    temperature,
    title,
    imgGenFields,
    // imgGenEnabled,
    // jobId,
    // partialImgArr,
    // requestMessageId,
    topP,
    userData
  }: ProviderGeminiChatRequestEntity) {
    const provider = "gemini" as const;

    const params = await this.contentGen({
      isNewChat,
      keyId,
      model,
      msgs,
      apiKey,
      imgGenFields,
      latlng: userData?.latlng,
      max_tokens,
      systemPrompt,
      temperature,
      topP
    });

    let geminiThinkingStartTime: number | null = null,
      geminiThinkingDuration = 0,
      geminiIsCurrentlyThinking = false,
      geminiThinkingAgg = "",
      geminiAgg = "",
      geminiDataPart: Blob | undefined = undefined;

    const gemini = this.getClient(apiKey);

    // const imagen = await gemini.models.generateImages({model: "imagen-4.0-generate-001" satisfies GeminiModelIdUnion,prompt: "",config: {includeRaiReason: true,}})
    // const s = await gemini.models.generateContentStream({contents: fullContent,model: "gemini-2.5-flash-image",config: {responseModalities: ["TEXT", "IMAGE"],imageConfig: {aspectRatio:"21:9"},thinkingConfig: {includeThoughts: true, thinkingBudget: -1},systemInstruction,mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH}})

    const stream = (await gemini.models.generateContentStream(
      params
    )) satisfies AsyncGenerator<GenerateContentResponse>;

    for await (const chunk of stream) {
      let dataPart: Blob | undefined = undefined,
        textPart: string | undefined = undefined,
        thinkingPart: string | undefined = undefined,
        done: keyof typeof FinishReason | undefined = undefined;

      if (chunk.candidates) {
        for (const candidate of chunk.candidates) {
          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.text) {
                if (part.thought) {
                  if (
                    geminiIsCurrentlyThinking === false &&
                    typeof geminiThinkingStartTime !== "number"
                  ) {
                    geminiIsCurrentlyThinking = part.thought;
                    geminiThinkingStartTime = performance.now();
                  }
                  thinkingPart = part.text;
                } else {
                  if (
                    geminiThinkingDuration === 0 &&
                    typeof geminiThinkingStartTime === "number"
                  ) {
                    geminiThinkingDuration = Math.round(
                      performance.now() - geminiThinkingStartTime
                    );
                    geminiIsCurrentlyThinking = part.thought ?? false;
                  }
                  textPart = part.text;
                }
              }
              if (part.fileData) {
                this.logger.debug(part.fileData, "part.fileData");
              }
              if (part.inlineData) {
                this.logger.debug(part.inlineData, "part.inlineData");
                dataPart = part.inlineData;
              }
            }
          }

          if (candidate.finishReason) {
            done = candidate.finishReason;
          }
        }
      }
      if (thinkingPart) {
        thinkingChunks.push(thinkingPart);
        geminiThinkingAgg += thinkingPart;

        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            userId,
            model,
            title,
            systemPrompt,
            isThinking: true,
            temperature,
            topP,
            provider,
            thinkingDuration: geminiThinkingStartTime
              ? ((start: number) => performance.now() - start)(
                  geminiThinkingStartTime
                )
              : undefined,
            thinkingText: thinkingPart,
            done: false,
            imgGenEnabled: false
          } satisfies EventTypeMap["ai_chat_chunk"])
        );

        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
          type: "ai_chat_chunk",
          conversationId,
          userId,
          model,
          title,
          systemPrompt,
          temperature,
          topP,
          provider,
          isThinking: true,
          thinkingDuration: geminiThinkingStartTime
            ? ((start: number) => performance.now() - start)(
                geminiThinkingStartTime
              )
            : undefined,
          thinkingText: thinkingPart,
          done: false,
          imgGenEnabled: false
        });
        if (chunks.length % 10 === 0) {
          void this.redis.saveStreamState(
            conversationId,
            chunks,
            {
              model,
              provider,
              title,
              totalChunks: chunks.length,
              completed: false,
              systemPrompt,
              temperature,
              topP
            },
            thinkingChunks
          );
        }
      }
      if (textPart) {
        chunks.push(textPart);
        geminiAgg += textPart;

        ws.send(
          JSON.stringify({
            type: "ai_chat_chunk",
            conversationId,
            userId,
            model,
            title,
            systemPrompt,
            isThinking: false,
            temperature,
            topP,
            provider,
            thinkingText: geminiThinkingAgg,
            chunk: textPart,
            thinkingDuration:
              geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
            done: false,
            imgGenEnabled: false
          } satisfies EventTypeMap["ai_chat_chunk"])
        );

        void this.redis.publishTypedEvent(streamChannel, "ai_chat_chunk", {
          type: "ai_chat_chunk",
          conversationId,
          userId,
          model,
          title,
          isThinking: false,
          systemPrompt,
          temperature,
          topP,
          thinkingText: geminiThinkingAgg,
          provider,
          thinkingDuration:
            geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
          chunk: textPart,
          done: false,
          imgGenEnabled: false
        });
        if (chunks.length % 10 === 0) {
          void this.redis.saveStreamState(
            conversationId,
            chunks,
            {
              model,
              provider,
              title,
              totalChunks: chunks.length,
              completed: false,
              systemPrompt,
              temperature,
              topP
            },
            thinkingChunks
          );
        }
      }
      if (dataPart?.data && dataPart?.mimeType) {
        geminiDataPart = dataPart;
        const _dataUrl =
          `data:${dataPart.mimeType};base64,${dataPart.data}` as const;
        ws.send(
          JSON.stringify({
            type: "ai_chat_inline_data",
            conversationId,
            data: _dataUrl,
            userId,
            done: false,
            model,
            chunk: geminiAgg,
            systemPrompt,
            temperature,
            title,
            topP,
            provider,
            imgGenEnabled: false
          } satisfies EventTypeMap["ai_chat_inline_data"])
        );
      }
      if (done) {
        await this.prisma.handleAiChatResponse({
          chunk: geminiAgg,
          conversationId,
          done: true,
          title,
          provider,
          userId,
          systemPrompt,
          temperature,
          data: geminiDataPart
            ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
            : undefined,
          topP,
          model,
          thinkingText: geminiThinkingAgg,
          thinkingDuration:
            geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
          imgGenEnabled: false
        });
        ws.send(
          JSON.stringify({
            type: "ai_chat_response",
            conversationId,
            userId,
            model,
            systemPrompt,
            data: geminiDataPart
              ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
              : undefined,
            temperature,
            title,
            topP,
            imgGenEnabled: false,
            provider,
            chunk: geminiAgg,
            thinkingText: geminiThinkingAgg,
            thinkingDuration:
              geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined,
            done: true
          } satisfies EventTypeMap["ai_chat_response"])
        );
        void this.redis.publishTypedEvent(streamChannel, "ai_chat_response", {
          type: "ai_chat_response",
          conversationId,
          userId,
          systemPrompt,
          temperature,
          imgGenEnabled: false,
          data: geminiDataPart
            ? `data:${geminiDataPart?.mimeType};base64,${geminiDataPart.data}`
            : undefined,
          thinkingDuration: geminiThinkingDuration,
          title,
          topP,
          thinkingText: geminiThinkingAgg,
          provider,
          model,
          chunk: geminiAgg,
          done: true
        });
        void this.redis.del(`stream:state:${conversationId}`);
        break;
      }
    }
  }
}
