import type { GenerateContentResponseProps } from "@/gemini/types.ts";
import type {
  Content,
  ContentUnion,
  File,
  GenerateContentConfig,
  GenerateContentParameters,
  Part,
  PartMediaResolution,
  ToolConfig,
  UploadFileParameters
} from "@google/genai";
import type { Logger } from "pino";
import { ExtractService } from "@/extract/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import {
  GoogleGenAI,
  PartMediaResolutionLevel,
  ThinkingLevel
} from "@google/genai";
import type {
  AttachmentSingleton,
  GeminiModelIdUnion,
  MessageSingleton
} from "@slipstream/types";

export class GeminiWorkupService {
  protected defaultClient: GoogleGenAI;
  protected logger: Logger;
  protected apiVersion = "v1alpha" as const;
  private assetCache = new Map<
    string,
    { fileUri: string; expiresAt: Date; databaseId: string }
  >();
  private fileRegistry = new Map<string, File>();
  private lastRegistrySync: Date | null = null;
  constructor(
    logger: LoggerService,
    protected prisma: PrismaService,
    protected extractor: ExtractService,
    protected apiKey: string
  ) {
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

  protected getClient(overrideKey?: string) {
    if (overrideKey) {
      return new GoogleGenAI({
        apiKey: overrideKey,
        apiVersion: this.apiVersion
      });
    }
    return this.defaultClient;
  }

  private async *getAllGoogleFiles(apiKey?: string, limit = 10) {
    const genai = this.getClient(apiKey);

    const pager = await genai.files.list({
      config: { pageSize: limit }
    });
    let has_more = true,
      count = 0,
      page_number = 0,
      page = pager.page;
    while (has_more) {
      has_more = pager.hasNextPage();
      count += page.length;

      yield {
        page,
        count,
        has_more,
        page_number
      };
      page_number += 1;
      if (!has_more) {
        break;
      }
      page = await pager.nextPage();
    }
  }
  // Note: markFileAccessed is not needed for Google's TTL-based system
  // Files automatically expire after 48 hours regardless of access patterns

  private async cleanupStaleFiles(apiKey?: string) {
    const client = this.getClient(apiKey);
    const filesToDelete = Array.of<string>();
    const dbRecordsToDelete = Array.of<string>();
    const toTuple = Array.from(this.fileRegistry.entries());
    const assetCacheFileNames = Array.from(this.assetCache.keys());
    for (const [name, record] of toTuple) {
      // Check if file has expired (Google Files have 48-hour TTL)
      if (record.expirationTime) {
        const expired = new Date(record.expirationTime).getTime();

        if (expired < Date.now()) {
          filesToDelete.push(name);
          // Collect database record IDs if available
          if (record.name && assetCacheFileNames.includes(record.name)) {
            const dbId = this.assetCache.get(record.name)?.databaseId;
            const expires = this.assetCache.get(record.name)?.expiresAt;
            if (dbId && expires && expires.getTime() < Date.now()) {
              dbRecordsToDelete.push(dbId);
            }
          }
        }
      }
    }

    if (filesToDelete.length === 0) {
      console.info("No stale files to clean up from google files api");
      return;
    }

    // Delete from database first (in transaction)

    if (dbRecordsToDelete.length > 0) {
      try {
        await this.prisma.deleteStaleIds(dbRecordsToDelete);
        this.logger.debug(
          dbRecordsToDelete,
          `Deleted ${dbRecordsToDelete.length} stale database records`
        );
        console.info(
          `cleaned up ${dbRecordsToDelete.length} files in cleanupStaleFiles for GEMINI - target -> database`
        );
      } catch (error) {
        this.logger.warn(
          { error },
          "Failed to delete stale files in cleanupStaleFiles for GEMINI - target -> database"
        );
      }
    }
    console.info(
      `no files to delete in cleanupStaleFiles for GEMINI - target -> database`
    );

    // Then delete from Google Files API
    for (const name of filesToDelete) {
      try {
        await client.files.delete({ name });
        // Remove from registry and cache
        this.fileRegistry.delete(name);
        // Also remove from assetCache if present (cache key matches the file name)
        if (this.assetCache.has(name)) {
          this.assetCache.delete(name);
        }
        console.info(
          filesToDelete,
          `Cleaned up ${filesToDelete.length} stale files for GEMINI - target->google files api`
        );
      } catch (error) {
        this.logger.warn(
          { error, name },
          `Failed to delete stale file ${name} for GEMINI - target->google files api`
        );
      }
    }
    console.log(
      `Cleanup complete: ${filesToDelete.length} files removed for GEMINI - target->google files api`
    );
  }

  public async syncFileRegistry(userId: string, cleanupStaleFiles = false) {
    const hasGeminiMessages = await this.prisma.hasProviderMessages(
      userId,
      "GEMINI"
    );
    if (!hasGeminiMessages) {
      return { synced: true, totalFiles: 0, lastSync: new Date() };
    }
    const tryApiKey = await this.prisma.handleApiKeyLookup("gemini", userId);

    console.info(
      `Starting Google Gemini file registry sync -- ${tryApiKey.apiKey === null ? "no gemini key on file" : "gemini api key on file"}`
    );

    let totalFiles = 0;

    const apiKey = tryApiKey.apiKey ?? this.apiKey;
    this.assetCache.clear();
    try {
      const providerAssets = await this.prisma.findManyByProvider(
        "GEMINI",
        userId
      );
      // Populate asset cache with active database mappings (gated by environment (database) and api key (user-key vs default server key))
      if (providerAssets.length > 0) {
        for (const asset of providerAssets) {
          if (asset.providerUri && asset.expiresAt && !asset.isExpired) {
            this.assetCache.set(asset.providerRef, {
              expiresAt: asset.expiresAt,
              fileUri: asset.providerUri,
              databaseId: asset.id
            });
          }
        }
      }

      console.info(
        `Populated Gemini asset cache with ${this.assetCache.size} entries from database`
      );
    } catch (error) {
      console.error({ error }, "Failed to populate asset cache from database");
    }
    // Clear and rebuild registry
    this.fileRegistry.clear();
    // Populate file registry cache but cross-compare with asset-cache entries before persisting (ensure database-existence for user before adding--
    // if a user is using the default server api key there will be many files not relevant to the user in the google files api)
    for await (const batch of this.getAllGoogleFiles(apiKey)) {
      for (const file of batch.page) {
        if (file.name && file.expirationTime && file.uri && file.sizeBytes) {
          if (this.assetCache.has(file.name)) {
            this.fileRegistry.set(file.name, {
              name: file.name,
              sizeBytes: file.sizeBytes,
              createTime: file.createTime,
              uri: file.uri,
              displayName: file.displayName,
              mimeType: file.mimeType,
              error: file.error,
              expirationTime: file.expirationTime,
              sha256Hash: file.sha256Hash,
              source: file.source,
              state: file.state,
              videoMetadata: file.videoMetadata,
              updateTime: file.updateTime,
              downloadUri: file.downloadUri
            });
          }
        }
      }

      totalFiles = batch.count;
      console.debug(`Synced ${batch.count} files, has_more: ${batch.has_more}`);
    }

    this.lastRegistrySync = new Date();
    console.info(
      `File registry and Asset cache sync complete for Gemini: ${totalFiles} files indexed`
    );

    // Optionally trigger cleanup of stale files
    if (cleanupStaleFiles) {
      await this.cleanupStaleFiles(apiKey);
    }
    // the same api key (for me) is used in prod and dev -- therefore, not all fileRegistry cached files will be available in either environment (shared file registry, database partitioned by env)
    if (this.fileRegistry.size !== this.assetCache.size) {
      if (this.fileRegistry.size > this.assetCache.size) {
        const fileRegistryCacheKeys = Array.from(this.fileRegistry.keys());
        for (const fileKey of fileRegistryCacheKeys) {
          if (!this.assetCache.has(fileKey)) {
            this.fileRegistry.delete(fileKey);
          }
        }
      }
      if (this.assetCache.size > this.fileRegistry.size) {
        const dbCacheKeys = Array.from(this.assetCache.keys());

        for (const dbKey of dbCacheKeys) {
          if (!this.fileRegistry.has(dbKey)) {
            this.assetCache.delete(dbKey);
          }
        }
      }
    }

    return { synced: true, totalFiles, lastSync: this.lastRegistrySync };
  }

  private async uploadRemoteAssetToGoogle(
    attachment: AttachmentSingleton<true>,
    apiKey?: string
  ) {
    const { absTmpPath, mime, tmpUniquename } =
      await this.prisma.fetchRemoteToTmp("GEMINI", attachment);

    const mimeType = mime === "application/text" ? "text/markdown" : mime;
    try {
      const ai = this.getClient(apiKey);
      const uploadedFile = await ai.files.upload({
        file: absTmpPath,
        config: {
          mimeType,
          name: `files/${attachment.id}`,
          displayName: attachment.filename ?? undefined
        }
      } satisfies UploadFileParameters);

      return uploadedFile;
    } catch (error) {
      this.logger.error(
        `Error uploading file to Google for attachment: ${attachment.id} - ${this.prisma.safeErrMsg(error)}`
      );
      throw new Error(
        error instanceof Error
          ? error.message
          : "Failed to upload file to Google Files API" +
            this.prisma.safeErrMsg(error)
      );
    } finally {
      this.prisma.cleanupTmpPostupload("GEMINI", absTmpPath, tmpUniquename);
    }
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

  private async formatHistoryForSession(
    msgs: MessageSingleton<true>[],
    keyFingerprint: string,
    keyId?: string,
    apiKey?: string,
    model?: GeminiModelIdUnion
  ) {
    const formatted = Array.of<Content>();
    const m = model ?? "gemini-2.5-pro";
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
                if (m === "gemini-3-pro-preview") {
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

  private async getHistoryAndInstruction(
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
          databaseId: d.id
        });

        this.logger.debug(
          { fileKey, state: existingInRegistry.state },
          `Found file in registry, skipping upload: files/${attachment.id}`
        );

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
    if (
      !(
        model === "gemini-2.5-flash-image" ||
        model === "gemini-3-pro-image-preview"
      )
    ) {
      return ["TEXT"];
    } else return ["TEXT", "IMAGE"];
  }

  private candidateCount(model: GeminiModelIdUnion, n = 1) {
    if (
      !(
        model === "gemini-2.5-flash-image" ||
        model === "gemini-3-pro-image-preview"
      )
    ) {
      return undefined;
    } else return this.prisma.handleImgGenCount("gemini", model, { n });
  }

  private getToolConfig(latlng?: string) {
    const [lat, lng] = this.prisma.handleLatLng(latlng);

    return {
      retrievalConfig: { latLng: { latitude: lat, longitude: lng } }
    } satisfies ToolConfig;
  }

  private getTools(model?: GeminiModelIdUnion) {
    const m = model ?? "gemini-2.5-pro";

    switch (m) {
      case "gemini-2.5-pro":
      case "gemini-3-pro-preview":
      case "gemini-2.5-flash": {
        return [
          { googleSearch: {} },
          { urlContext: {} }
        ] satisfies GenerateContentConfig["tools"];
      }
      case "gemini-3-pro-image-preview": {
        return [{ googleSearch: {} }] satisfies GenerateContentConfig["tools"];
      }
      case "gemini-2.5-flash-image": {
        return [] satisfies GenerateContentConfig["tools"];
      }
      case "gemini-2.5-flash-lite": {
        return [
          { googleSearch: {} },
          { urlContext: {} }
        ] satisfies GenerateContentConfig["tools"];
      }
      case "gemini-2.0-flash": {
        return [{ googleSearch: {} }] satisfies GenerateContentConfig["tools"];
      }
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
        return undefined satisfies GenerateContentConfig["tools"];
      }
    }
  }

  private getThinkingConfig(model?: GeminiModelIdUnion) {
    const m = model ?? "gemini-2.5-pro";
    switch (m) {
      /**
       * gemini-3-* only
       */
      case "gemini-3-pro-preview": {
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
    const { nanoid } = await import("nanoid");
    if (target === "generationGroupId") {
      const generationGroupId = "resp_" + nanoid();
      return generationGroupId;
    } else return nanoid();
  }

  private async contentGenChat({
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
    const tools = this.getTools(m);
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
        automaticFunctionCalling: { disable: false },
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

  private async contentGenNanoBananas({
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
    // fallback to platform provided server api key for users that don't have a Google API Key on file
    const keyFingerprint = keyId ?? "server";
    const toolConfig = this.getToolConfig(latlng);
    const tools = this.getTools(m);
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
    const out = imgGenFields?.output_size as
      | "1:1"
      | "2:3"
      | "3:2"
      | "3:4"
      | "4:3"
      | "9:16"
      | "16:9"
      | "21:9"
      | undefined;

    const aspectRatio = this.prisma.handleOutputSize("gemini", m, {
      output_size: out
    });
    const imageSize = this.prisma.handleImgGenOutputQuality("gemini", m, {
      output_quality: imgGenFields?.output_quality as
        | "1K"
        | "2K"
        | "4K"
        | undefined
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
      (m === "gemini-2.5-flash-image" || m === "gemini-3-pro-image-preview") &&
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
