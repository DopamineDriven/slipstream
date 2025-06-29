import WS from "ws";
import type { EventTypeMap, UserData } from "@/types/index.ts";

export import NodeWebSocket=WS;

export type MessageHandler<T extends keyof EventTypeMap> = (
  event: EventTypeMap[T],
  ws: NodeWebSocket,
  userId: string,
  userData?: UserData
) => Promise<void> | void;

export type HandlerMap = {
  [K in keyof EventTypeMap]?: MessageHandler<K>;
};
