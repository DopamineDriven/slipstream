export const RedisChannels = {
  // User-specific channels
  user: (userId: string) => `user:${userId}` as const,
  userPresence: (userId: string) => `presence:${userId}` as const,

  // Conversation channels
  conversation: (conversationId: string) => `conv:${conversationId}` as const,
  conversationStream: (conversationId: string) => `stream:${conversationId}` as const,

  // System-wide channels
  system: {
    broadcasts: 'system:broadcasts',
    metrics: 'system:metrics'
  }
} as const;
