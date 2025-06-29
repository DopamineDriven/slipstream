"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useMemo
} from "react";
import { useSession } from "next-auth/react";
import type {
  EventTypeMap,
  ChatWsEventTypeUnion,
  EventMap,
  ModelProvider,
  SelectedProvider
} from "@/types/chat-ws";
import { useChatWebSocketContext } from "@/context/chat-ws-context";

// State for a conversation: all events/messages, chunk in-progress, error
type ChatMessage = EventMap<"message" | "ai_chat_chunk" | "ai_chat_response" | "ai_chat_error">;

interface ConversationState {
  conversationId: string;
  messages: ChatMessage[];
  // For currently streaming AI message; will be committed on ai_chat_response or ai_chat_error
  aiStreamingChunk: string;
  aiStreamingProvider?: ModelProvider;
  aiStreamingModel?: SelectedProvider<ModelProvider>;
  error?: string | null;
}

type ChatState = Record<string, ConversationState>;

type ChatAction =
  | {
      type: "add_message";
      conversationId: string;
      message: ChatMessage;
    }
  | {
      type: "add_chunk";
      conversationId: string;
      chunk: EventMap<"ai_chat_chunk">;
    }
  | {
      type: "finish_stream";
      conversationId: string;
      response: EventMap<"ai_chat_response">;
    }
  | {
      type: "error";
      conversationId: string;
      error: EventMap<"ai_chat_error">;
    }
  | {
      type: "reset";
      conversationId: string;
    }
  | {
      type: "hydrate";
      conversationId: string;
      messages: ChatMessage[];
    };

// Reducer
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  const { conversationId } = action;
  const convo = state[conversationId] ?? {
    conversationId,
    messages: [],
    aiStreamingChunk: ""
  };

  switch (action.type) {
    case "add_message":
      return {
        ...state,
        [conversationId]: {
          ...convo,
          aiStreamingChunk: "",
          error: undefined,
          messages: [...convo.messages, action.message]
        }
      };
    case "add_chunk":
      return {
        ...state,
        [conversationId]: {
          ...convo,
          aiStreamingChunk: convo.aiStreamingChunk + action.chunk.chunk,
          aiStreamingProvider: action.chunk.provider,
          aiStreamingModel: action.chunk.model,
          error: undefined
        }
      };
    case "finish_stream":
      return {
        ...state,
        [conversationId]: {
          ...convo,
          messages: [
            ...convo.messages,
            {
              ...action.response,
              chunk: convo.aiStreamingChunk + action.response.chunk // final aggregate
            }
          ],
          aiStreamingChunk: "",
          aiStreamingProvider: undefined,
          aiStreamingModel: undefined,
          error: undefined
        }
      };
    case "error":
      return {
        ...state,
        [conversationId]: {
          ...convo,
          messages: [
            ...convo.messages,
            action.error // store error event just like server emits it
          ],
          aiStreamingChunk: "",
          aiStreamingProvider: undefined,
          aiStreamingModel: undefined,
          error: action.error.message
        }
      };
    case "reset":
      return {
        ...state,
        [conversationId]: {
          conversationId,
          messages: [],
          aiStreamingChunk: "",
          aiStreamingProvider: undefined,
          aiStreamingModel: undefined,
          error: undefined
        }
      };
    case "hydrate":
      return {
        ...state,
        [conversationId]: {
          ...convo,
          messages: action.messages,
          aiStreamingChunk: "",
          aiStreamingProvider: undefined,
          aiStreamingModel: undefined,
          error: undefined
        }
      };
    default:
      return state;
  }
}

// Context
interface ChatContextValue {
  conversations: ChatState;
  sendUserMessage: (
    conversationId: string,
    content: string,
    opts?: { provider?: ModelProvider; model?: SelectedProvider<ModelProvider>; apiKey?: string }
  ) => void;
  resetConversation: (conversationId: string) => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { lastEvent, sendEvent } = useChatWebSocketContext();
  const [state, dispatch] = useReducer(chatReducer, {});

  // Main event handler
  useEffect(() => {
    if (!lastEvent) return;
    const { type, conversationId } = lastEvent as {
      type: ChatWsEventTypeUnion;
      conversationId: string;
    };
    if (!conversationId) return;

    switch (type) {
      case "message":
        dispatch({ type: "add_message", conversationId, message: lastEvent as EventMap<"message"> });
        break;
      case "ai_chat_chunk":
        dispatch({ type: "add_chunk", conversationId, chunk: lastEvent as EventMap<"ai_chat_chunk"> });
        break;
      case "ai_chat_response":
        dispatch({ type: "finish_stream", conversationId, response: lastEvent as EventMap<"ai_chat_response"> });
        break;
      case "ai_chat_error":
        dispatch({ type: "error", conversationId, error: lastEvent as EventMap<"ai_chat_error"> });
        break;
      default:
        // You may wish to handle inline_data, uploads, etc., here!
        break;
    }
  }, [lastEvent]);

  // For sending user messages as ai_chat_request events
  const sendUserMessage = useCallback(
    (
      conversationId: string,
      content: string,
      opts?: { provider?: ModelProvider; model?: SelectedProvider<ModelProvider>; apiKey?: string }
    ) => {
      // Server handles userId; don't send from client.
      sendEvent({
        type: "ai_chat_request",
        conversationId,
        prompt: content,
        ...(opts ?? {})
      } as EventMap<"ai_chat_request">);
    },
    [sendEvent]
  );

  const resetConversation = useCallback(
    (conversationId: string) => {
      dispatch({ type: "reset", conversationId });
    },
    []
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      conversations: state,
      sendUserMessage,
      resetConversation
    }),
    [state, sendUserMessage, resetConversation]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within a ChatProvider");
  return ctx;
}
