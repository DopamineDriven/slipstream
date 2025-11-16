import type { GenerateContentResponseProps } from "@/gemini/types.ts";
import type {
  Content,
  ContentUnion,
  File,
  GenerateContentParameters,
  Part,
  ThinkingConfig,
  ToolConfig,
  ToolListUnion,
  UploadFileParameters
} from "@google/genai";
import type { Logger } from "pino";
import { ExtractService } from "@/extract/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { GoogleGenAI } from "@google/genai";
import type {
  AttachmentSingleton,
  GeminiModelIdUnion,
  MessageSingleton
} from "@slipstream/types";

export class GeminiWorkupService {
  protected defaultClient: GoogleGenAI;
  protected logger: Logger;
  protected apiVersion = "v1alpha" as const;
  private assetCache = new Map<string, { fileUri: string; expiresAt: Date }>();
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

    for (const [name, record] of this.fileRegistry) {
      // Check if file has expired (Google Files have 48-hour TTL)
      if (record.expirationTime) {
        const expired = new Date(record.expirationTime).getTime();

        if (expired < Date.now()) {
          filesToDelete.push(name);
          // Collect database record IDs if available
          if (record.name) {
            dbRecordsToDelete.push(record.name);
          }
        }
      }
    }

    if (filesToDelete.length === 0) {
      this.logger.info("No stale files to clean up");
      return;
    }

    this.logger.debug(
      filesToDelete,
      `Cleaning up ${filesToDelete.length} stale files`
    );

    // Delete from database first (in transaction)
    if (dbRecordsToDelete.length > 0) {
      try {
        await this.prisma.deleteStaleIds(dbRecordsToDelete);
        this.logger.debug(
          dbRecordsToDelete,
          `Deleted ${dbRecordsToDelete.length} stale database records`
        );
      } catch (error) {
        this.logger.warn({ error }, "Failed to delete stale database records");
      }
    }
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
        // Also clean up any other expired cache entries
        for (const [key, value] of this.assetCache) {
          if (new Date(value.expiresAt).getTime() < Date.now()) {
            this.assetCache.delete(key);
          }
        }

        this.logger.debug(
          { name: name },
          `Deleted stale file from Google Files API: ${name}`
        );
      } catch (error) {
        this.logger.warn(
          { error, name },
          `Failed to delete stale file ${name} from Google`
        );
      }
    }
    this.logger.debug(
      {},
      `Cleanup complete: ${filesToDelete.length} files removed`
    );
  }

  public async syncFileRegistry(userId: string, cleanupStaleFiles = false) {
    const hasGeminiMessages = await this.prisma.hasProviderMessages(
      userId,
      "GEMINI"
    );
    if (!hasGeminiMessages)
      return { synced: true, totalFiles: 0, lastSync: new Date() };
    const tryApiKey = await this.prisma.handleApiKeyLookup("gemini", userId);

    this.logger.info(
      `Starting Google Gemini file registry sync -- ${tryApiKey.apiKey === null ? "no gemini key on file" : "gemini api key on file"}`
    );

    let totalFiles = 0;

    const apiKey = tryApiKey.apiKey ?? this.apiKey;

    // Clear and rebuild registry
    this.fileRegistry.clear();

    for await (const batch of this.getAllGoogleFiles(apiKey)) {
      for (const file of batch.page) {
        if (file.name && file.expirationTime && file.uri && file.sizeBytes) {
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

      totalFiles = batch.count;
      console.debug(`Synced ${batch.count} files, has_more: ${batch.has_more}`);
    }
    try {
      const providerAssets = await this.prisma.findManyByProvider(
        "GEMINI",
        userId
      );

      // Populate asset cache with active database mappings
      for (const asset of providerAssets) {
        if (asset.providerUri && asset.expiresAt && !asset.isExpired) {
          // Only add to cache if file exists in registry (authoritative source)
          if (this.fileRegistry.has(asset.providerRef)) {
            this.assetCache.set(asset.providerRef, {
              expiresAt: asset.expiresAt,
              fileUri: asset.providerUri
            });
          } else {
            this.logger.warn(
              {
                providerRef: asset.providerRef,
                attachmentId: asset.attachmentId
              },
              "DB asset not found in Google registry, skipping cache entry"
            );
          }
        }
      }

      console.info(
        `Populated Gemini asset cache with ${this.assetCache.size} entries from database`
      );
    } catch (error) {
      this.logger.error(
        { error },
        "Failed to populate asset cache from database"
      );
    }
    this.lastRegistrySync = new Date();
    this.logger.info(
      `File registry and Asset cache sync complete for Gemini: ${totalFiles} files indexed`
    );

    // Optionally trigger cleanup of stale files
    if (cleanupStaleFiles) {
      await this.cleanupStaleFiles(apiKey);
    }

    return { synced: true, totalFiles, lastSync: this.lastRegistrySync };
  }

  private async fetchAssetForGenAI(url: string, mime: string | null) {
    const mimeType = mime ?? "application/octet-stream";

    const response = await fetch(url, { method: "GET" });
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch asset: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const chunks = Array.of<Uint8Array>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
      }
    }
    const buffer = Buffer.concat(chunks);

    return { buffer, mimeType };
  }

  private async uploadRemoteAssetToGoogle(
    attachment: AttachmentSingleton<true>,
    apiKey?: string
  ) {
    try {
      // Determine URL and MIME type based on compatibility status
      let url: string | null;
      let mime: string | null;
      if (attachment.compatStatus === "ACTIVE") {
        url = attachment.compatCdnUrl ?? attachment.cdnUrl;
        mime = attachment.compatMime ?? attachment.mime;
      } else {
        url = attachment.cdnUrl ?? attachment.compatCdnUrl;
        mime = attachment.mime ?? attachment.compatMime;
      }

      if (!url || !mime) {
        throw new Error("No CDN URL or MIME type available for upload");
      }

      // Fetch the remote file
      const { buffer, mimeType } = await this.fetchAssetForGenAI(url, mime);

      // Upload to Google's File API with deterministic naming
      const ai = this.getClient(apiKey);
      const uploadedFile = await ai.files.upload({
        file: new Blob([buffer]),
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
          : "Failed to upload file to Google Files API"
      );
    }
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
                partArr.push({
                  fileData: { fileUri, mimeType }
                });
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
        await this.prisma.upsertGeminiAssetMapping(
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
          expiresAt
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
        expiresAt: new Date(uploadedFile.expirationTime)
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
    if (!(model === "gemini-2.5-flash-image")) {
      return ["TEXT"];
    } else return ["TEXT", "IMAGE"];
  }

  private candidateCount(model: GeminiModelIdUnion, n = 1) {
    if (!(model === "gemini-2.5-flash-image")) {
      return undefined;
    } else return this.prisma.handleImgGenCount("gemini", model, { n });
  }

  private getToolConfig(latlng?: string) {
    const [lat, lng] = this.prisma.handleLatLng(latlng);

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

  protected async contentGen({
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

  protected async nanoBananaContentGen() {
    // const nanoBanana = await gemini.models.generateContentStream({contents: fullContent,model: "gemini-2.5-flash-image",config: {responseModalities: ["TEXT", "IMAGE"],imageConfig: {aspectRatio:"21:9"},thinkingConfig: {includeThoughts: true, thinkingBudget: -1},systemInstruction,mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH}})
  }

  protected async imagenContentGen() {
    // const imagen = await gemini.models.generateImages({model: "imagen-4.0-generate-001" satisfies GeminiModelIdUnion,prompt: "",config: {includeRaiReason: true,}})
  }
}
