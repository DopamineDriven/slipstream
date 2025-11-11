import type { XOR } from "@/utils.ts";

export type BigIntOrNumber<T extends boolean = false> = T extends true
  ? number
  : bigint;

export type UserSingleton<T extends boolean = false> = {
  image: string | null;
  id: string;
  createdAt: Date;
  updatedAt: Date;
  name: string | null;
  email: string;
  emailVerified: Date | null;
  email_verified: boolean | null;
  isAnonymous: boolean | null;
  lastLoginMethod: string | null;
  conversations?: ConversationSingleton<T>[];
  attachments?: AttachmentSingleton<T>[];
  keys?: UserKeySingleton<T>[];
  accounts?: AccountSingleton<T>[];
  sessions?: SessionSingleton<T>[];
  profile?: ProfileSingleton<T>;
  settings?: SettingsSingleton<T>;
};

export type SessionSingleton<T extends boolean = false> = {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  sessionToken: string;
  ipAddress: string | null;
  userAgent: string | null;
  expires: Date;
  user?: UserSingleton<T>;
};

export type AccountSingleton<T extends boolean = false> = {
  id: string;
  userId: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
  provider: string;
  type: string | null;
  providerAccountId: string;
  refresh_token: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  access_token: string | null;
  expires_at: number | null;
  token_type: string | null;
  scope: string | null;
  password: string | null;
  id_token: string | null;
  session_state: string | null;
  user?: UserSingleton<T>;
};

export type ProfileSingleton<T extends boolean = false> = {
  id: string;
  bio: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string | null;
  userId: string;
  user?: UserSingleton<T>;
};

export type SettingsSingleton<T extends boolean = false> = {
  id: string;
  userId: string;
  theme: SettingsTheme | null;
  defaultProvider: PrismaProvider | null;
  defaultModel: string | null;
  user?: UserSingleton<T>;
};

export type DocumentSingleton = {
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  attachmentId: string;
  format: string;
  pageCount: number | null;
  wordCount: number | null;
  language: string | null;
  author: string | null;
  subject: string | null;
  keywords: string[];
  pdfVersion: string | null;
  isEncrypted: boolean;
  isSearchable: boolean;
  isLinearized: boolean | null;
  encoding: string | null;
  lineCount: number | null;
  textPreview: string | null;
};

export type AttachmentProviderSingleton<T extends boolean = false> = {
  id: string;
  attachmentId: string;
  provider: PrismaProvider;
  userKeyId: string | null;
  keyFingerprint: string;
  state: AttachmentProviderState;
  providerUri: string | null;
  providerRef: string | null;
  mime: string | null;
  size: BigIntOrNumber<T> | null;
  readyAt: Date | null;
  expiresAt: Date | null;
  lastCheckedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ImageSingleton = {
  createdAt: Date;
  updatedAt: Date;
  attachmentId: string;
  format: ImageMetadataFormat;
  width: number;
  colorModel: ImageMetadataColorModel | null;
  height: number;
  aspectRatio: number | null;
  frames: number;
  hasAlpha: boolean | null;
  animated: boolean;
  orientation: number | null;
  colorSpace: ImageMetadataColorSpace | null;
  exifDateTimeOriginal: Date | null;
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  gpsLat: number | null;
  gpsLon: number | null;
  dominantColorHex: string | null;
  iccProfile: string | null;
};

export type ConvoSettingsSingleton<T extends boolean = false> = {
  id: string;
  conversationId: string;
  createdAt: Date;
  updatedAt: Date;
  systemPrompt: string | null;
  temperature: number | null;
  topP: number | null;
  maxTokens: number | null;
  enableThinking: boolean | null;
  trackUsage: boolean | null;
  enableWebSearch: boolean | null;
  enableAssetGen: boolean | null;
  reasoningEffort: ConvoSettingsReasoningEffort | null;
  outputVerbosity: ConvoSettingsVerbosity | null;
  usageAlerts: boolean | null;
  conversation?: ConversationSingleton<T>;
};

export type ImageGenJobSingleton<T extends boolean = false> = {
  id: string;
  userKeyId: string | null;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  provider: PrismaProvider;
  model: string;
  keyFingerprint: string | null;
  prompt: string;
  systemPrompt: string | null;
  temperature: number | null;
  topP: number | null;
  nRequested: number;
  nCompleted: number;
  seed: number | null;
  negativePrompt: string | null;
  outputSize: string | null;
  outputQuality: string | null;
  outputFormat: string | null;
  outputBackground: string | null;
  outputCompression: number | null;
  partialImagesRequested: number | null;
  inputFidelity: string | null;
  personGeneration: string | null;
  moderation: string | null;
  stage: ImageGenJobStage;
  progress: number;
  etaSeconds: number | null;
  durationMs: number | null;
  usage: number | null;
  revisedPrompt: string | null;
  error: string | null;
  requestMessageId: string;
  outputs?: ImageGenOutputSingleton<T>[];
  userKey?: UserKeySingleton<T>;
  requestMessage?: MessageSingleton<T>;
};

export type ImageGenOutputSingleton<T extends boolean = false> = {
  id: string;
  seriesId: string;
  ext: string | null;
  mime: string | null;
  createdAt: Date;
  updatedAt: Date;
  jobId: string;
  jobIndex: number;
  kind: ImageGenOutputKind;
  seriesIndex: number;
  isPartial: boolean;
  attachmentId: string;
  width: number | null;
  height: number | null;
  revisedPrompt: string | null;
  job?: ImageGenJobSingleton<T>;
};

export type AttachmentSingleton<T extends boolean = false> = {
  id: string;
  conversationId: string | null;
  draftId: string | null;
  batchId: string | null;
  userId: string;
  messageId: string | null;
  s3ObjectId: string | null;
  origin: AttachmentOrigin;
  status: AttachmentStatus;
  compatKey: string | null;
  compatStatus: AttachmentCompatStatus | null;
  compatCdnUrl: string | null;
  compatReadyAt: Date | null;
  generationGroupId?: string | null;
  compatVersionId: string | null;
  compatS3ObjectId: string | null;
  compatMime: string | null;
  compatExt: string | null;
  uploadMethod: AttachmentUploadMethod;
  assetType: AttachmentType;
  uploadDuration: number | null;
  cdnUrl: string | null;
  publicUrl: string | null;
  sourceUrl: string | null;
  thumbnailKey: string | null;
  bucket: string;
  key: string;
  versionId: string | null;
  region: string;
  cacheControl: string | null;
  contentDisposition: string | null;
  contentEncoding: string | null;
  expiresAt: Date | null;
  size: BigIntOrNumber<T> | null;
  filename: string | null;
  ext: string | null;
  mime: string | null;
  etag: string | null;
  checksumAlgo: AttachmentChecksumAlgo;
  checksumSha256: string | null;
  storageClass: string | null;
  sseAlgorithm: string | null;
  sseKmsKeyId: string | null;
  s3LastModified: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  providerLinks?: AttachmentProviderSingleton<T>[];
  image: ImageSingleton | null;
  document: DocumentSingleton | null;
  imageGenOutput: ImageGenOutputSingleton<T> | null;
};

export type UserKeySingleton<T extends boolean = false> = {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  provider: PrismaProvider;
  apiKey: string;
  iv: string;
  authTag: string;
  label: string | null;
  isDefault: boolean;
  user?: UserSingleton<T>;
  messages?: MessageSingleton<T>[];
  imageGenJobs?: ImageGenJobSingleton<T>[];
  attachmentProviders?: AttachmentProviderSingleton<T>[];
};

export type MessageSingleton<T extends boolean = false> = {
  id: string;
  userId: string | null;
  provider: PrismaProvider;
  createdAt: Date;
  updatedAt: Date;
  userKeyId: string | null;
  conversationId: string;
  model: string | null;
  senderType: MessageSenderType;
  messageType: MessageType | null
  content: string;
  thinkingText: string | null;
  thinkingDuration: number | null;
  liked: boolean | null;
  disliked: boolean | null;
  tryAgain: boolean | null;
  imageGenJob?: ImageGenJobSingleton<T> | null;
  userKey?: UserKeySingleton<T> | null;
  attachments: AttachmentSingleton<T>[];
};

export type ConversationSingleton<T extends boolean = false> = {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  userKeyId: string | null;
  title: string | null;
  branchId: string | null;
  parentId: string | null;
  isShared: boolean;
  shareToken: string | null;
  apiKey: string | null;
  conversationSettings: ConvoSettingsSingleton<T> | null;
  messages: MessageSingleton<T>[];
  attachments?: AttachmentSingleton<T>[];
  user?: UserSingleton<T>;
};

export type AssetReadyPayload = {
  publicUrl: string | null;
  bucket: string;
  cacheControl: string | null;
  contentDisposition: string | null;
  etag: string | null;
  s3ObjectId: string | null;
  key: string;
  cdnUrl: string | null;
  versionId: string | null;
  size: bigint | null;
  storageClass: string | null;
  id: string;
  conversationId: string | null;
  draftId: string | null;
  batchId: string | null;
  userId: string;
  messageId: string | null;
  origin: AttachmentOrigin;
  status: AttachmentStatus;
  uploadMethod: AttachmentUploadMethod;
  assetType: AttachmentType;
  uploadDuration: number | null;
  sourceUrl: string | null;
  thumbnailKey: string | null;
  region: string;
  contentEncoding: string | null;
  expiresAt: Date | null;
  filename: string | null;
  ext: string | null;
  mime: string | null;
  checksumAlgo: AttachmentChecksumAlgo;
  checksumSha256: string | null;
  sseAlgorithm: string | null;
  sseKmsKeyId: string | null;
  s3LastModified: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};


export type MessageType = "AUDIO_GEN" | "COMPUTER_USE" | "IMAGE_GEN" | "TEXT" | "VIDEO_GEN";
export type FlexiProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "grok"
  | "meta"
  | "vercel"
  | "OPENAI"
  | "ANTHROPIC"
  | "GEMINI"
  | "GROK"
  | "META"
  | "VERCEL";

export type PrismaProvider =
  | "OPENAI"
  | "GROK"
  | "GEMINI"
  | "ANTHROPIC"
  | "META"
  | "VERCEL";

export type ImageGenJobStage =
  | "FAILED"
  | "QUEUED"
  | "PROCESSING"
  | "PERSISTING"
  | "FINALIZING"
  | "COMPLETED"
  | "REFUSAL"
  | "ABORTED";

export type AttachmentProviderState =
  | "ACTIVE"
  | "PENDING"
  | "EXPIRED"
  | "FAILED"
  | "DELETED";

export type SettingsTheme = "LIGHT" | "DARK" | "SYSTEM";

export type AttachmentOrigin =
  | "UPLOAD"
  | "REMOTE"
  | "GENERATED"
  | "PASTED"
  | "SCREENSHOT"
  | "IMPORTED"
  | "SCRAPED";

export type AttachmentStatus =
  | "REQUESTED"
  | "PLANNED"
  | "UPLOADING"
  | "STORED"
  | "SCANNING"
  | "READY"
  | "FAILED"
  | "QUARANTINED"
  | "ATTACHED"
  | "DELETED";

export type ImageGenOutputKind = "FINAL" | "PARTIAL";

export type AttachmentCompatStatus =
  | "FAILED"
  | "PENDING"
  | "ACTIVE"
  | "ALIASED";

export type AttachmentType =
  | "IMAGE"
  | "DOCUMENT"
  | "AUDIO"
  | "VIDEO"
  | "UNKNOWN";

export type AttachmentUploadMethod =
  | "GENERATED"
  | "FETCHED"
  | "PRESIGNED"
  | "SERVER";

export type AttachmentChecksumAlgo =
  | "CRC32"
  | "CRC32C"
  | "SHA1"
  | "SHA256"
  | "CRC64NVME";

export type MessageSenderType = "USER" | "AI" | "SYSTEM";

export type ConvoSettingsReasoningEffort =
  | "minimal"
  | "low"
  | "medium"
  | "high";

export type ConvoSettingsVerbosity = "low" | "high" | "medium";

export type ImageMetadataColorSpace =
  | "unknown"
  | "srgb"
  | "display_p3"
  | "adobe_rgb"
  | "prophoto_rgb"
  | "rec2020"
  | "rec709"
  | "cmyk"
  | "lab"
  | "xyz"
  | "gray";

export type ImageMetadataColorModel =
  | "unknown"
  | "cmyk"
  | "lab"
  | "rgb"
  | "rgba"
  | "grayscale"
  | "grayscale_alpha"
  | "indexed"
  | "ycbcr"
  | "ycck"
  | "vector";

export type ImageMetadataFormat =
  | "apng"
  | "png"
  | "gif"
  | "bmp"
  | "webp"
  | "avif"
  | "svg"
  | "ico"
  | "tiff"
  | "jpeg"
  | "heic"
  | "unknown"
  | "jxl"
  | "jp2"
  | "jpx"
  | "jxr"
  | "jls"
  | "raw"
  | "dng"
  | "cr2"
  | "nef"
  | "arw"
  | "hdr"
  | "pic"
  | "rgbe"
  | "xyze";

export type Signals =
  | "SIGABRT"
  | "SIGALRM"
  | "SIGBREAK"
  | "SIGBUS"
  | "SIGCHLD"
  | "SIGCONT"
  | "SIGFPE"
  | "SIGHUP"
  | "SIGILL"
  | "SIGINFO"
  | "SIGINT"
  | "SIGIO"
  | "SIGIOT"
  | "SIGKILL"
  | "SIGLOST"
  | "SIGPIPE"
  | "SIGPOLL"
  | "SIGPROF"
  | "SIGPWR"
  | "SIGQUIT"
  | "SIGSEGV"
  | "SIGSTKFLT"
  | "SIGSTOP"
  | "SIGSYS"
  | "SIGTERM"
  | "SIGTRAP"
  | "SIGTSTP"
  | "SIGTTIN"
  | "SIGTTOU"
  | "SIGUNUSED"
  | "SIGURG"
  | "SIGUSR1"
  | "SIGUSR2"
  | "SIGVTALRM"
  | "SIGWINCH"
  | "SIGXCPU"
  | "SIGXFSZ";

export interface ListModelsSingleton {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export type SuccessResponse = {
  object: "list";
  data: ListModelsSingleton[];
};

export type GrokModelsResponse = SuccessResponse;

export type OpenAiError = {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string;
  };
};

export type AnthropicError = {
  type: "error";
  error: {
    type: string;
    message: string;
  };
};

export interface AnthropicModel {
  created_at: string;
  display_name: string;
  id: string;
  type: "model";
}

export type AnthropicSuccess = {
  data: AnthropicModel[];
  first_id: string | null;
  last_id: string | null;
  has_more: boolean;
};

export interface GeminiModel {
  name: string;
  version: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
  temperature?: number;
  topP?: number;
  topK?: number;
}

export type GeminiSuccess = {
  models: GeminiModel[];
  nextPageToken: string;
};

export type GeminiError = {
  error: {
    code: number;
    message: string;
    status: string;
  };
};

export type AnthropicResponse = XOR<AnthropicError, AnthropicSuccess>;

export type OpenAiResponse = XOR<OpenAiError, SuccessResponse>;

export type GeminiResponse = XOR<GeminiError, GeminiSuccess>;
