import type { EventTypeMap } from "@slipstream/types";
import type { WithImplicitCoercion } from "buffer";

export type RawData = WithImplicitCoercion<string | ArrayLike<number>>;

export type MessageHandler<T extends keyof EventTypeMap> = (
  event: EventTypeMap[T],
  ws: WebSocket
) => Promise<void> | void;

export type HandlerMap = {
  [K in keyof EventTypeMap]?: MessageHandler<K>;
};
