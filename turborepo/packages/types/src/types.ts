import type { Rm } from "@/utils.ts";
import type {
  $Enums,
  Account,
  Attachment,
  AttachmentProvider,
  Conversation,
  ConversationSettings,
  DocumentMetadata,
  ImageGenJob,
  ImageGenOutput,
  ImageMetadata,
  Message,
  Profile,
  ProviderStore,
  ProviderStoreDocument,
  Session,
  Settings,
  User,
  UserKey
} from "@slipstream/db/node/generated/client";

export type BigIntOrNumber<T extends boolean = false> = T extends true
  ? number
  : bigint;

export interface UserSingleton<T extends boolean = false> extends User {
  conversations?: ConversationSingleton<T>[];
  attachments?: AttachmentSingleton<T>[];
  keys?: UserKeySingleton<T>[];
  accounts?: AccountSingleton<T>[];
  sessions?: SessionSingleton<T>[];
  profile?: ProfileSingleton<T>;
  providerStores?: ProviderStoreSingleton<T>[];
  settings?: SettingsSingleton<T>;
}

export interface SessionSingleton<T extends boolean = false> extends Session {
  user?: UserSingleton<T>;
}

export interface AccountSingleton<T extends boolean = false> extends Account {
  user?: UserSingleton<T>;
}

export interface ProfileSingleton<T extends boolean = false> extends Profile {
  user?: UserSingleton<T>;
}

export interface SettingsSingleton<T extends boolean = false> extends Settings {
  user?: UserSingleton<T>;
}

export interface DocumentSingleton extends DocumentMetadata {}

export interface AttachmentProviderSingleton<
  T extends boolean = false
> extends Rm<AttachmentProvider, "size"> {
  size: BigIntOrNumber<T> | null;
  attachment?: AttachmentSingleton<T>;
  userKey?: UserKeySingleton<T>;
  store?: ProviderStoreSingleton<T>;
}

export interface ProviderStoreSingleton<T extends boolean = false> extends Rm<
  ProviderStore,
  "totalBytes"
> {
  totalBytes: BigIntOrNumber<T> | null;
  files?: AttachmentProviderSingleton<T>[];
  docs?: ProviderStoreDocumentSingleton<T>[];
}

export interface ProviderStoreDocumentSingleton<
  T extends boolean = false
> extends Rm<ProviderStoreDocument, "size"> {
  size: BigIntOrNumber<T> | null;

  store?: ProviderStoreSingleton<T>;
  attachment?: AttachmentSingleton<T>;
}

export interface ImageSingleton extends ImageMetadata {}

export interface ConvoSettingsSingleton<
  T extends boolean = false
> extends ConversationSettings {
  conversation?: ConversationSingleton<T>;
}

export interface ImageGenJobSingleton<
  T extends boolean = false
> extends ImageGenJob {
  outputs?: ImageGenOutputSingleton<T>[];
  userKey?: UserKeySingleton<T>;
  requestMessage?: MessageSingleton<T>;
}

export interface ImageGenOutputSingleton<
  T extends boolean = false
> extends ImageGenOutput {
  job?: ImageGenJobSingleton<T>;
}

export interface AttachmentSingleton<T extends boolean = false> extends Rm<
  Attachment,
  "size"
> {
  size: BigIntOrNumber<T> | null;
  providerLinks?: AttachmentProviderSingleton<T>[];

  providerStoreDocs?: ProviderStoreDocumentSingleton<T>[];
  image: ImageSingleton | null;
  document: DocumentSingleton | null;
  imageGenOutput: ImageGenOutputSingleton<T> | null;
}

export interface UserKeySingleton<T extends boolean = false> extends UserKey {
  user?: UserSingleton<T>;
  messages?: MessageSingleton<T>[];
  imageGenJobs?: ImageGenJobSingleton<T>[];
  attachmentProviders?: AttachmentProviderSingleton<T>[];
}

export interface MessageSingleton<T extends boolean = false> extends Message {
  imageGenJob?: ImageGenJobSingleton<T> | null;
  userKey?: UserKeySingleton<T> | null;
  attachments: AttachmentSingleton<T>[];
}

export interface ConversationSingleton<
  T extends boolean = false
> extends Conversation {
  conversationSettings: ConvoSettingsSingleton<T> | null;
  messages: MessageSingleton<T>[];
  attachments?: AttachmentSingleton<T>[];
  user?: UserSingleton<T>;
}

export interface ConversationSingletonOneOff<
  T extends boolean = false
> extends ConversationSingleton<T> {
  apiKey?: string | null;
}

export type FlexiProvider = $Enums.Provider | Lowercase<$Enums.Provider>;

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
  origin: $Enums.AssetOrigin;
  status: $Enums.AssetStatus;
  uploadMethod: $Enums.UploadMethod;
  assetType: $Enums.AssetType;
  uploadDuration: number | null;
  sourceUrl: string | null;
  thumbnailKey: string | null;
  region: string;
  contentEncoding: string | null;
  expiresAt: Date | null;
  filename: string | null;
  ext: string | null;
  mime: string | null;
  checksumAlgo: $Enums.ChecksumAlgo;
  checksumSha256: string | null;
  sseAlgorithm: string | null;
  sseKmsKeyId: string | null;
  s3LastModified: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
