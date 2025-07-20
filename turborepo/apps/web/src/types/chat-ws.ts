import type { WithImplicitCoercion } from "buffer";
import type { EventTypeMap } from "@t3-chat-clone/types";

export type RawData = WithImplicitCoercion<string | ArrayLike<number>>;

export type MessageHandler<T extends keyof EventTypeMap> = (
  event: EventTypeMap[T],
  ws: WebSocket
) => Promise<void> | void;

export type HandlerMap = {
  [K in keyof EventTypeMap]?: MessageHandler<K>;
};
