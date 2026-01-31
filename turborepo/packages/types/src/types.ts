import type { DX, SerializeBigInt } from "@/utils.ts";
import type {
  Account,
  Attachment,
  AttachmentProvider,
  AudioMetadata,
  Conversation,
  ConversationMemoryChunk,
  ConversationMemoryContext,
  ConversationMemoryStore,
  ConversationSettings,
  DocumentMetadata,
  ImageGenJob,
  ImageGenOutput,
  ImageMetadata,
  LocalVectorStore,
  LocalVectorStoreDoc,
  LocalVectorStoreDocChunk,
  Message,
  Profile,
  ProviderStore,
  ProviderStoreDocument,
  Session,
  Settings,
  User,
  UserKey,
  VideoMetadata
} from "@slipstream/db/node/generated/client";

export type NormalizeAndInject<V, Q = object, P extends boolean = boolean> = DX<
  SerializeBigInt<V, P> & Q
>;

export type UserSingleton<T extends boolean = false> = NormalizeAndInject<
  User,
  {
    conversations?: ConversationSingleton<T>[];
    attachments?: AttachmentSingleton<T>[];
    keys?: UserKeySingleton<T>[];
    accounts?: AccountSingleton<T>[];
    sessions?: SessionSingleton<T>[];
    profile?: ProfileSingleton<T>;
    providerStores?: ProviderStoreSingleton<T>[];
    localVectorStores?: LocalVectorStoreSingleton<T>[];
    settings?: SettingsSingleton<T>;
    conversationMemoryStore?: ConversationMemoryStoreSingleton<T>;
  },
  T
>;

export type SessionSingleton<T extends boolean = false> = NormalizeAndInject<
  Session,
  {
    user?: UserSingleton<T>;
  },
  T
>;

export type AccountSingleton<T extends boolean = false> = NormalizeAndInject<
  Account,
  {
    user?: UserSingleton<T>;
  },
  T
>;

export type ProfileSingleton<T extends boolean = false> = NormalizeAndInject<
  Profile,
  {
    user?: UserSingleton<T>;
  },
  T
>;

export type SettingsSingleton<T extends boolean = false> = NormalizeAndInject<
  Settings,
  {
    user?: UserSingleton<T>;
  },
  T
>;

export type LocalVectorStoreSingleton<T extends boolean = false> =
  NormalizeAndInject<
    LocalVectorStore,
    {
      user?: UserSingleton<T>;
      docs?: LocalVectorStoreDocSingleton<T>[];
    },
    T
  >;

export type LocalVectorStoreDocSingleton<T extends boolean = false> =
  NormalizeAndInject<
    LocalVectorStoreDoc,
    {
      store?: LocalVectorStoreSingleton<T>;
      attachment?: AttachmentSingleton<T>;
      chunks?: LocalVectorStoreDocChunkSingleton<T>[];
    },
    T
  >;
export type LocalVectorStoreDocChunkSingleton<T extends boolean = false> =
  NormalizeAndInject<
    LocalVectorStoreDocChunk,
    { doc?: LocalVectorStoreDocSingleton<T> },
    T
  >;

export type ImageSingleton = ImageMetadata;
export type DocumentSingleton = DocumentMetadata;
export type VideoSingleton = VideoMetadata;
export type AudioSingleton = AudioMetadata;

export type AttachmentProviderSingleton<T extends boolean = false> =
  NormalizeAndInject<
    AttachmentProvider,
    { attachment?: AttachmentSingleton<T>; userKey?: UserKeySingleton<T> },
    T
  >;

export type ProviderStoreSingleton<T extends boolean = false> =
  NormalizeAndInject<
    ProviderStore,
    { docs?: ProviderStoreDocumentSingleton<T>[] },
    T
  >;

export type ProviderStoreDocumentSingleton<T extends boolean = false> =
  NormalizeAndInject<
    ProviderStoreDocument,
    {
      store?: ProviderStoreSingleton<T>;
      attachment?: AttachmentSingleton<T>;
    },
    T
  >;
export type ConversationMemoryStoreSingleton<T extends boolean = false> =
  NormalizeAndInject<
    ConversationMemoryStore,
    {
      contexts?: ConversationMemoryContextSingleton<T>[];
    },
    T
  >;

export type ConversationMemoryContextSingleton<T extends boolean = false> =
  NormalizeAndInject<
    ConversationMemoryContext,
    {
      memoryStore?: ConversationMemoryStoreSingleton<T>;
      conversation?: ConversationSingleton<T>;
      memoryChunks?: ConversationMemoryChunkSingleton<T>[];
    },
    T
  >;

export type ConversationMemoryChunkSingleton<T extends boolean = false> =
  NormalizeAndInject<
    ConversationMemoryChunk,
    {
      context?: ConversationMemoryContextSingleton<T>;
      messages?: MessageSingleton<T>[];
    },
    T
  >;

export type ConvoSettingsSingleton<T extends boolean = false> =
  NormalizeAndInject<
    ConversationSettings,
    {
      conversation?: ConversationSingleton<T>;
    },
    T
  >;

export type ImageGenJobSingleton<T extends boolean = false> =
  NormalizeAndInject<
    ImageGenJob,
    {
      outputs?: ImageGenOutputSingleton<T>[];
      userKey?: UserKeySingleton<T>;
      requestMessage?: MessageSingleton<T>;
    },
    T
  >;

export type ImageGenOutputSingleton<T extends boolean = false> =
  NormalizeAndInject<
    ImageGenOutput,
    {
      job?: ImageGenJobSingleton<T>;
    },
    T
  >;

export type AttachmentSingleton<T extends boolean = false> = NormalizeAndInject<
  Attachment,
  {
    localVectorStoreDocs?: LocalVectorStoreDocSingleton<T>[];
    providerLinks?: AttachmentProviderSingleton<T>[];
    providerStoreDocs?: ProviderStoreDocumentSingleton<T>[];
    image: ImageSingleton | null;
    document: DocumentSingleton | null;
    imageGenOutput: ImageGenOutputSingleton<T> | null;
  },
  T
>;

export type UserKeySingleton<T extends boolean = false> = NormalizeAndInject<
  UserKey,
  {
    user?: UserSingleton<T>;
    messages?: MessageSingleton<T>[];
    imageGenJobs?: ImageGenJobSingleton<T>[];
    attachmentProviders?: AttachmentProviderSingleton<T>[];
  },
  T
>;

export type MessageSingleton<T extends boolean = false> = NormalizeAndInject<
  Message,
  {
    imageGenJob?: ImageGenJobSingleton<T> | null;
    userKey?: UserKeySingleton<T> | null;
    attachments: AttachmentSingleton<T>[];
    conversationMemoryChunk?: ConversationMemoryChunkSingleton<T>;
  },
  T
>;

export type ConversationSingleton<T extends boolean = false> =
  NormalizeAndInject<
    Conversation,
    {
      conversationSettings: ConvoSettingsSingleton<T> | null;
      messages: MessageSingleton<T>[];
      attachments?: AttachmentSingleton<T>[];
      user?: UserSingleton<T>;
      conversationContextState?: ConversationMemoryContextSingleton<T>;
    },
    T
  >;

export type ConversationSingletonOneOff<T extends boolean = false> =
  NormalizeAndInject<
    ConversationSingleton<T>,
    {
      apiKey?: string | null;
    },
    T
  >;
