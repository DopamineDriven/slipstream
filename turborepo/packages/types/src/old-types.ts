import type { DX, Equal, FlexiCase, Rm, SerializeBigInt } from "@/utils.ts";
import type {
  $Enums,
  Account,
  Attachment,
  AttachmentProvider,
  Conversation,
  LocalVectorStoreDocChunk,
  ConversationMemoryChunk,
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
  UserKey,
  ConversationMemoryContext
} from "@slipstream/db/node/generated/client";

export type BigIntOrNumber<T extends boolean = false> = T extends true
  ? number
  : bigint;

export interface UserSingleton<
  T extends boolean = false,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends User {
  conversations?: ConversationSingleton<T, ConvoChunk, DocChunk>[];
  attachments?: AttachmentSingleton<T, ConvoChunk, DocChunk>[];
  keys?: UserKeySingleton<T, ConvoChunk, DocChunk>[];
  accounts?: AccountSingleton<T, ConvoChunk, DocChunk>[];
  sessions?: SessionSingleton<T, ConvoChunk, DocChunk>[];
  profile?: ProfileSingleton<T, ConvoChunk, DocChunk>;
  providerStores?: ProviderStoreSingleton<T, ConvoChunk, DocChunk>[];
  settings?: SettingsSingleton<T, ConvoChunk, DocChunk>;
}

export interface SessionSingleton<
  T extends boolean = false,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends Session {
  user?: UserSingleton<T, ConvoChunk, DocChunk>;
}

export interface AccountSingleton<
  T extends boolean = false,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends Account {
  user?: UserSingleton<T, ConvoChunk, DocChunk>;
}

export interface ProfileSingleton<
  T extends boolean = false,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends Profile {
  user?: UserSingleton<T, ConvoChunk, DocChunk>;
}

export interface SettingsSingleton<
  T extends boolean = false,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends Settings {
  user?: UserSingleton<T, ConvoChunk, DocChunk>;
}

export interface DocumentSingleton extends DocumentMetadata {}

export interface AttachmentProviderSingleton<
  T extends boolean = boolean,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends SerializeBigInt<AttachmentProvider, T> {
  attachment?: AttachmentSingleton<T, ConvoChunk, DocChunk>;
  userKey?: UserKeySingleton<T, ConvoChunk, DocChunk>;
}


export namespace Chunk {
  export type ConditionalObj = {
    score: number;
    embedding: number[];
  };
  export type ChunkObj = {
    DocChunk: LocalVectorStoreDocChunk;
    ConvoChunk: ConversationMemoryChunk;
  };
  export type AppendEmbeddingScores<
    Z extends keyof ChunkObj,
    W extends readonly [boolean, boolean] = readonly [false, false]
  > = W extends readonly [false, false]
    ? ChunkObj[Z]
    : W extends readonly [true, false]
      ? DX<ChunkObj[Z] & Rm<ConditionalObj, "score">>
      : W extends readonly [false, true]
        ? DX<ChunkObj[Z] & Rm<ConditionalObj, "embedding">>
        : DX<ChunkObj[Z] & ConditionalObj>;

  export namespace Fields {
    export type All<T extends keyof ChunkObj> = AppendEmbeddingScores<
      T,
      readonly [true, true]
    >;
    export type Score<T extends keyof ChunkObj> = AppendEmbeddingScores<
      T,
      readonly [false, true]
    >;
    export type Embedding<T extends keyof ChunkObj> = AppendEmbeddingScores<
      T,
      readonly [true, false]
    >;
    export type None<T extends keyof ChunkObj> = AppendEmbeddingScores<
      T,
      readonly [false, false]
    >;
  }

  export type Fields<T extends Opts.FieldUnion, K extends Opts.TargetUnion> = {
    all: Fields.All<T>;
    none: Fields.None<T>;
    score: Fields.Score<T>;
    embedding: Fields.Embedding<T>;
  }[K];
  export namespace Opts {
    export type FieldUnion = "DocChunk" | "ConvoChunk";

    export type TargetUnion = "all" | "score" | "embedding" | "none";
  }
  export type Opts<
    T extends Opts.FieldUnion,
    K extends Opts.TargetUnion = "none"
  > = K extends "all"
    ? Fields.All<T>
    : K extends "score"
      ? Fields.Score<T>
      : K extends "embedding"
        ? Fields.Embedding<T>
        : Fields.None<T>;
}

export interface ProviderStoreSingleton<
  T extends boolean = boolean,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends SerializeBigInt<ProviderStore, T> {
  docs?: ProviderStoreDocumentSingleton<T, ConvoChunk, DocChunk>[];
  conversationStates?: ConversationContextStateSingleton<
    T,
    ConvoChunk,
    DocChunk
  >[];
}
export interface ProviderStoreDocumentSingleton<
  T extends boolean = boolean,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends SerializeBigInt<ProviderStoreDocument, T> {
  providerStoreDocChunks?: ProviderStoreDocumentChunkSingleton<
    T,
    ConvoChunk,
    DocChunk
  >[];
  store?: ProviderStoreSingleton<T, ConvoChunk, DocChunk>;
  attachment?: AttachmentSingleton<T, ConvoChunk, DocChunk>;
}

export type ProviderStoreDocumentChunkSingleton<
  T extends boolean = false,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> = Chunk.Opts<"DocChunk", DocChunk> & {
  providerStoreDoc?: ProviderStoreDocumentSingleton<T, ConvoChunk, DocChunk>;
};
export interface ImageSingleton extends ImageMetadata {}

export interface ImageGenJobSingleton<
  T extends boolean = false,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends ImageGenJob {
  outputs?: ImageGenOutputSingleton<T, ConvoChunk, DocChunk>[];
  userKey?: UserKeySingleton<T, ConvoChunk, DocChunk>;
  requestMessage?: MessageSingleton<T, ConvoChunk, DocChunk>;
}

export interface ImageGenOutputSingleton<
  T extends boolean = false,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends ImageGenOutput {
  job?: ImageGenJobSingleton<T, ConvoChunk, DocChunk>;
}

export interface AttachmentSingleton<
  T extends boolean = boolean,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends SerializeBigInt<Attachment, T>{
  providerLinks?: AttachmentProviderSingleton<T>[];
  providerStoreDocs?: ProviderStoreDocumentSingleton<T, ConvoChunk, DocChunk>[];
  image: ImageSingleton | null;
  document: DocumentSingleton | null;
  imageGenOutput: ImageGenOutputSingleton<T, ConvoChunk, DocChunk> | null;
}

export interface UserKeySingleton<
  T extends boolean = false,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends UserKey {
  user?: UserSingleton<T>;
  messages?: MessageSingleton<T, ConvoChunk, DocChunk>[];
  imageGenJobs?: ImageGenJobSingleton<T, ConvoChunk, DocChunk>[];
  attachmentProviders?: AttachmentProviderSingleton<T>[];
}

export interface MessageSingleton<
  T extends boolean = false,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends Message {
  imageGenJob?: ImageGenJobSingleton<T, ConvoChunk, DocChunk> | null;
  userKey?: UserKeySingleton<T, ConvoChunk, DocChunk> | null;
  attachments: AttachmentSingleton<T, ConvoChunk, DocChunk>[];
}

export type ConversationMemoryChunkSingleton<
  T extends boolean = false,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> = DX<
  Chunk.Opts<"ConvoChunk", ConvoChunk> & {
    contextState?: ConversationContextStateSingleton<T, ConvoChunk, DocChunk>;
  }
>;

export interface ConvoSettingsSingleton<
  T extends boolean = false,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends ConversationSettings {
  conversation?: ConversationSingleton<T, ConvoChunk, DocChunk>;
}

export interface ConversationSingleton<
  T extends boolean = false,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends Conversation {
  conversationSettings: ConvoSettingsSingleton<T, ConvoChunk, DocChunk> | null;
  messages: MessageSingleton<T, ConvoChunk, DocChunk>[];
  attachments?: AttachmentSingleton<T, ConvoChunk, DocChunk>[];
  user?: UserSingleton<T>;
  conversationStates?: ConversationContextStateSingleton<
    T,
    ConvoChunk,
    DocChunk
  >[];
}

export interface ConversationSingletonOneOff<
  T extends boolean = false,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends ConversationSingleton<T, ConvoChunk, DocChunk> {
  apiKey?: string | null;
}

export interface ConversationContextStateSingleton<
  T extends boolean = false,
  ConvoChunk extends Chunk.Opts.TargetUnion = "none",
  DocChunk extends Chunk.Opts.TargetUnion = "none"
> extends ConversationMemoryContext {
  conversation?: ConversationSingleton<T, ConvoChunk, DocChunk>;
  store?: ProviderStoreSingleton<T, ConvoChunk, DocChunk>;
  memoryChunks?: ConversationMemoryChunkSingleton<T, ConvoChunk, DocChunk>[];
}

export type FlexiProvider = FlexiCase<$Enums.Provider>;

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

type ALLTEST = DX<
  LocalVectorStoreDocChunk & {
    score: number;
    embedding: number[];
  }
>;

// true
export type DOC_GAUGE = Equal<Chunk.Opts<"DocChunk", "all">, ALLTEST>;

// true
export type CONVO_GAUGE = Equal<
  DX<Chunk.Opts<"ConvoChunk", "all">>,
  DX<ConversationMemoryChunk & { score: number; embedding: number[] }>
>;
