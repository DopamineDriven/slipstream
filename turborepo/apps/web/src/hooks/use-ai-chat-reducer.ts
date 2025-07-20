"use client";

/**
 * AI Chat Context - Manages chat conversations and streaming state
 *
 * Streaming Architecture:
 * - ai_chat_chunk: Streams partial content with done=false
 * - ai_chat_response: Marks end of stream with done=true and complete aggregated content
 * - ai_chat_error: Indicates stream failure with done=true
 * - ai_chat_inline_data: Additional data during streaming
 *
 * The first chunk always contains the conversationId and title for new chats.
 */

// Types
export interface ChatMessage {
  id: string;
  content: string;
  timestamp: number;
  isComplete: boolean;
}

export interface ChatConversation {
  id: string;
  title: string | null;
  messages: ChatMessage[];
  streamingMessage: string;
  error: string | null;
  isStreaming: boolean;
}

export interface ChatState {
  conversations: Map<string, ChatConversation>;
  activeConversationId: string | null;
  activeStreams: Set<string>; // userId -> active stream tracking
}

// Actions
export type ChatAction =
  | { type: "START_STREAM"; conversationId: string; userId: string }
  | {
      type: "APPEND_CHUNK";
      conversationId: string;
      chunk: string;
      title?: string;
    }
  | { type: "COMPLETE_MESSAGE"; conversationId: string; finalContent: string }
  | { type: "SET_ERROR"; conversationId: string; error: string }
  | { type: "END_STREAM"; conversationId: string; userId: string }
  | { type: "SET_ACTIVE_CONVERSATION"; conversationId: string }
  | { type: "CREATE_CONVERSATION"; conversationId: string }
  | { type: "MIGRATE_CONVERSATION"; tempId: string; realId: string };

// Reducer
export function useAiChatReducer(
  state: ChatState,
  action: ChatAction
) {
  switch (action.type) {
    case "START_STREAM": {
      const newState = { ...state };
      newState.activeStreams.add(action.userId);

      // Ensure conversation exists
      if (!newState.conversations.has(action.conversationId)) {
        newState.conversations.set(action.conversationId, {
          id: action.conversationId,
          title: null,
          messages: [],
          streamingMessage: "",
          error: null,
          isStreaming: true
        });
      } else {
        const conv = newState.conversations.get(action.conversationId);
        if (!conv)
          throw new Error(
            "error in useAiChatReducer on newState.conversations.get method"
          );
        newState.conversations.set(action.conversationId, {
          ...conv,
          streamingMessage: "",
          error: null,
          isStreaming: true
        });
      }

      return {
        ...newState,
        activeConversationId: action.conversationId
      };
    }

    case "APPEND_CHUNK": {
      const conv = state.conversations.get(action.conversationId);
      if (!conv) return state;

      const newConversations = new Map(state.conversations);
      newConversations.set(action.conversationId, {
        ...conv,
        streamingMessage: conv.streamingMessage + action.chunk,
        title: action.title ?? conv.title
      });

      return { ...state, conversations: newConversations };
    }

    case "COMPLETE_MESSAGE": {
      const conv = state.conversations.get(action.conversationId);
      if (!conv) return state;

      const newMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        content: action.finalContent, // This is the complete aggregated message
        timestamp: Date.now(),
        isComplete: true
      };

      const newConversations = new Map(state.conversations);
      newConversations.set(action.conversationId, {
        ...conv,
        messages: [...conv.messages, newMessage],
        streamingMessage: "", // Clear streaming message
        isStreaming: false // Stream is complete
      });

      return { ...state, conversations: newConversations };
    }

    case "SET_ERROR": {
      const conv = state.conversations.get(action.conversationId);
      if (!conv) return state;

      const newConversations = new Map(state.conversations);
      newConversations.set(action.conversationId, {
        ...conv,
        error: action.error,
        isStreaming: false
      });

      return { ...state, conversations: newConversations };
    }

    case "END_STREAM": {
      const newStreams = new Set(state.activeStreams);
      newStreams.delete(action.userId);

      const conv = state.conversations.get(action.conversationId);
      if (!conv) return { ...state, activeStreams: newStreams };

      const newConversations = new Map(state.conversations);
      newConversations.set(action.conversationId, {
        ...conv,
        isStreaming: false
      });

      return {
        ...state,
        conversations: newConversations,
        activeStreams: newStreams
      };
    }

    case "SET_ACTIVE_CONVERSATION":
      return { ...state, activeConversationId: action.conversationId };

    case "CREATE_CONVERSATION": {
      const newConversations = new Map(state.conversations);
      newConversations.set(action.conversationId, {
        id: action.conversationId,
        title: null,
        messages: [],
        streamingMessage: "",
        error: null,
        isStreaming: false
      });

      return {
        ...state,
        conversations: newConversations,
        activeConversationId: action.conversationId
      };
    }

    case "MIGRATE_CONVERSATION": {
      const tempConv = state.conversations.get(action.tempId);
      if (!tempConv) return state;

      const newConversations = new Map(state.conversations);

      // Remove temp conversation
      newConversations.delete(action.tempId);

      // Add with real ID
      newConversations.set(action.realId, {
        ...tempConv,
        id: action.realId
      });

      return {
        ...state,
        conversations: newConversations,
        activeConversationId:
          state.activeConversationId === action.tempId
            ? action.realId
            : state.activeConversationId
      };
    }

    default:
      return state;
  }
}

