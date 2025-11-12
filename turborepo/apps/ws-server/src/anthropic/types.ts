import { ProviderChatRequestEntity } from "@/types/index.ts";

export interface AnthropicFileRecord {
  id: string;
  size_bytes: number;
  created_at: string;
  filename: string;
  mime_type: string;
  lastAccessedAt?: Date; // Track from our end
  dbRecordId?: string;
}

export interface ProviderAnthropicChatRequestEntity
  extends ProviderChatRequestEntity {
  user_location?: {
    type: "approximate";
    city?: string | null | undefined;
    country?: string | null | undefined;
    region?: string | null | undefined;
    timezone?: string | null | undefined;
  };
}
