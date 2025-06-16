export type Nullable<T> = T | null;

export interface UserDTO {
  id: string;
  name: Nullable<string>;
  email: Nullable<string>;
  emailVerified: Nullable<string>;
  image: Nullable<string>;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileDTO {
  id: string;
  bio: Nullable<string>;
  location: Nullable<string>;
  userId: string;
}

export interface AccountDTO {
  id: string;
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token: Nullable<string>;
  access_token: Nullable<string>;
  expires_at: Nullable<number>;
  token_type: Nullable<string>;
  scope: Nullable<string>;
  id_token: Nullable<string>;
  session_state: Nullable<string>;
}

export interface SessionDTO {
  id: string;
  sessionToken: string;
  userId: string;
  expires: string;
}

export interface UserKeyDTO {
  id: string;
  userId: string;
  provider: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsDTO {
  id: string;
  userId: string;
  theme: Nullable<string>;
}

export interface AiAgentDTO {
  id: string;
  provider: string;
  model: string;
  displayName: Nullable<string>;
  description: Nullable<string>;
}

export interface AttachmentDTO {
  id: string;
  messageId: string;
  conversationId: Nullable<string>;
  url: string;
  type: string;
  createdAt: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: Nullable<string>;
  senderType: "user" | "ai" | "system";
  content: string;
  createdAt: string;
  updatedAt: string;
  aiAgentId: Nullable<string>;
  attachments: AttachmentDTO[];
}

export interface ConversationDTO {
  id: string;
  userId: string;
  title: Nullable<string>;
  createdAt: string;
  updatedAt: string;
  aiAgentId: Nullable<string>;
  branchId: Nullable<string>;
  parentId: Nullable<string>;
  isShared: boolean;
  shareToken: Nullable<string>;
  messages: MessageDTO[];
  attachments: AttachmentDTO[];
}


