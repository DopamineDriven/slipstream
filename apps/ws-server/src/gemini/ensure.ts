import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import { FileSearchStoreService } from "@/gemini/fss.ts";
import type { AttachmentSingleton } from "@slipstream/types";

export class GeminiEnsureService extends FileSearchStoreService {
  constructor(logger: LoggerService, prisma: PrismaService, apiKey: string) {
    super(logger, prisma, apiKey);
  }

  protected async ensureAssetUploaded(
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
}
