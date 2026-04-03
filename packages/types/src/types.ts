import type { SerializeBigInt } from "@/utils.ts";
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
  MessageBlock,
  Profile,
  ProviderStore,
  ProviderStoreDocument,
  Session,
  Settings,
  TTSJob,
  User,
  UserKey,
  UserStore,
  UserStoreDoc,
  UserStoreDocAnnot,
  UserStoreDocChunk,
  VideoMetadata
} from "@slipstream/db/node/generated/client";

export interface UserSingleton<T extends boolean = false> extends User {
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
  userStores?: UserStoreSingleton<T>[];
}

export interface SessionSingleton<T extends boolean = false> extends Session {
  user?: UserSingleton<T>;
  docs?: UserStoreDoc[];
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

export interface UserStoreSingleton<
  T extends boolean = false
> extends SerializeBigInt<UserStore, T> {
  user?: UserSingleton<T>;
  docs?: UserStoreDocSingleton<T>[];
}

export interface UserStoreDocSingleton<
  T extends boolean = false
> extends SerializeBigInt<UserStoreDoc, T> {
  store?: UserStoreSingleton<T>;
  attachment?: AttachmentSingleton<T>;
  annots?: UserStoreDocAnnotSingleton<T>[];
  linkedFromAnnots?: UserStoreDocAnnotSingleton<T>[];
  chunks?: UserStoreDocChunkSingleton<T>[];
}

export interface TTSJobSingleton<
  T extends boolean = false
> extends SerializeBigInt<TTSJob, T> {
  message?: MessageSingleton<T>;
  attachment?: AttachmentSingleton<T>;
}

export interface UserStoreDocAnnotSingleton<
  T extends boolean = false
> extends UserStoreDocAnnot {
  doc?: UserStoreDocSingleton<T>;
  linkedDoc?: UserStoreDocSingleton<T>;
}

export interface UserStoreDocChunkSingleton<
  T extends boolean = false
> extends UserStoreDocChunk {
  doc?: UserStoreDocSingleton<T>;
}

export interface LocalVectorStoreSingleton<
  T extends boolean = false
> extends SerializeBigInt<LocalVectorStore, T> {
  user?: UserSingleton<T>;
  docs?: LocalVectorStoreDocSingleton<T>[];
}

export interface LocalVectorStoreDocSingleton<
  T extends boolean = false
> extends SerializeBigInt<LocalVectorStoreDoc, T> {
  store?: LocalVectorStoreSingleton<T>;
  attachment?: AttachmentSingleton<T>;
  chunks?: LocalVectorStoreDocChunkSingleton<T>[];
}

export interface LocalVectorStoreDocChunkSingleton<
  T extends boolean = false
> extends SerializeBigInt<LocalVectorStoreDocChunk, T> {
  doc?: LocalVectorStoreDocSingleton<T>;
}

export interface ImageSingleton extends ImageMetadata {}
export interface DocumentSingleton extends DocumentMetadata {}
export interface VideoSingleton extends VideoMetadata {}
export interface AudioSingleton extends AudioMetadata {}

export interface AttachmentProviderSingleton<
  T extends boolean = false
> extends SerializeBigInt<AttachmentProvider, T> {
  attachment?: AttachmentSingleton<T>;
  userKey?: UserKeySingleton<T>;
}
export interface MessageBlockSingleton<
  T extends boolean = false
> extends MessageBlock {
  message?: MessageSingleton<T>;
}

export interface ProviderStoreSingleton<
  T extends boolean = false
> extends SerializeBigInt<ProviderStore, T> {
  docs?: ProviderStoreDocumentSingleton<T>[];
}

export interface ProviderStoreDocumentSingleton<
  T extends boolean = false
> extends SerializeBigInt<ProviderStoreDocument, T> {
  store?: ProviderStoreSingleton<T>;
  attachment?: AttachmentSingleton<T>;
}

export interface ConversationMemoryStoreSingleton<
  T extends boolean = false
> extends SerializeBigInt<ConversationMemoryStore, T> {
  contexts?: ConversationMemoryContextSingleton<T>[];
}

export interface ConversationMemoryContextSingleton<
  T extends boolean = false
> extends ConversationMemoryContext {
  memoryStore?: ConversationMemoryStoreSingleton<T>;
  conversation?: ConversationSingleton<T>;
  memoryChunks?: ConversationMemoryChunkSingleton<T>[];
}
export interface ConversationMemoryChunkSingleton<
  T extends boolean = false
> extends SerializeBigInt<ConversationMemoryChunk, T> {
  context?: ConversationMemoryContextSingleton<T>;
  messages?: MessageSingleton<T>[];
}

export interface ConvoSettingsSingleton<
  T extends boolean = false
> extends ConversationSettings {
  conversation?: ConversationSingleton<T>;
}

export interface ImageGenJobSingleton<
  T extends boolean = boolean
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

export interface AttachmentSingleton<
  T extends boolean = false
> extends SerializeBigInt<Attachment, T> {
  localVectorStoreDocs?: LocalVectorStoreDocSingleton<T>[];
  providerLinks?: AttachmentProviderSingleton<T>[];
  providerStoreDocs?: ProviderStoreDocumentSingleton<T>[];
  image: ImageSingleton | null;
  document: DocumentSingleton | null;
  audio: AudioSingleton | null;
  imageGenOutput: ImageGenOutputSingleton<T> | null;
  userStoreDoc?: UserStoreDocSingleton<T>;
  ttsJob?: TTSJobSingleton<T>;
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
  conversationMemoryChunk?: ConversationMemoryChunkSingleton<T>;
  ttsJob?: TTSJobSingleton<T>;
  messageBlocks?: MessageBlockSingleton<T>[];
}

export interface ConversationSingleton<
  T extends boolean = false
> extends Conversation {
  conversationSettings: ConvoSettingsSingleton<T> | null;
  messages: MessageSingleton<T>[];
  attachments?: AttachmentSingleton<T>[];
  user?: UserSingleton<T>;
  conversationContextState?: ConversationMemoryContextSingleton<T>;
}
export interface ConversationSingletonOneOff<
  T extends boolean = false
> extends ConversationSingleton<T> {
  apiKey?: string | null;
}
