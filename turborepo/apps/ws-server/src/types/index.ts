import { Provider } from "@/generated/client/enums.ts";
import { WebSocket } from "ws";
import type { EventTypeMap } from "@t3-chat-clone/types";

export interface WSServerOptions {
  port: number;
  jwtSecret: string;
  channel?: string;
}

export interface UserData {
  email?: string;
  city?: string;
  country?: string;
  region?: string;
  latlng?: string;
  tz?: string;
}

export type MessageHandler<T extends keyof EventTypeMap> = (
  event: EventTypeMap[T],
  ws: WebSocket,
  userId: string,
  userData?: UserData
) => Promise<void> | void;

export type HandlerMap = {
  [K in keyof EventTypeMap]?: MessageHandler<K>;
};

export type BufferLike =
  | string
  | Buffer
  | DataView
  | number
  | ArrayBufferView
  | Uint8Array
  | ArrayBuffer
  | SharedArrayBuffer
  | Blob
  | readonly any[]
  | readonly number[]
  | { valueOf(): ArrayBuffer }
  | { valueOf(): SharedArrayBuffer }
  | { valueOf(): Uint8Array }
  | { valueOf(): readonly number[] }
  | { valueOf(): string }
  | { [Symbol.toPrimitive](hint: string): string };

export type ProviderCountsProps = {
  openai: number;
  grok: number;
  gemini: number;
  anthropic: number;
};

export type RecordCountsProps = {
  isSet: ProviderCountsProps;
  isDefault: ProviderCountsProps;
};

export type ClientContextWorkupProps = {
  isSet: Record<Lowercase<keyof typeof Provider>, boolean>;
  isDefault: Record<Lowercase<keyof typeof Provider>, boolean>;
};
