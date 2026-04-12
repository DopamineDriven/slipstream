export const RedisChannels = {
  // User-specific channels
  user: (userId: string) => `user:${userId}` as const,
  userPresence: (userId: string) => `presence:${userId}` as const,

  // Conversation channels
  conversation: (conversationId: string) => `conv:${conversationId}` as const,
  conversationStream: (conversationId: string) => `stream:${conversationId}` as const,

  // Fan-out channels for parallelized mode
  parallelStream: (
    conversationId: string,
    runId: string,
    provider: string,
    model: string
  ) => `parallel:${conversationId}:${runId}:${provider}:${model}` as const,

  // System-wide channels
  system: {
    broadcasts: 'system:broadcasts',
    metrics: 'system:metrics'
  }
} as const;
