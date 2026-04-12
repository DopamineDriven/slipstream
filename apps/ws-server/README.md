## Node.js WebSocket Server

*details coming soon*
protected redisChannels = {
  user: (userId: string) => `user:${userId}` as const,
  userPresence: (userId: string) => `presence:${userId}` as const,
  conversation: (conversationId: string) => `conv:${conversationId}` as const,
  conversationStream: (conversationId: string) =>
    `stream:${conversationId}` as const,
 
  // fan-out for parallelized mode (NEW) per-variant stream
  parallelStream: (
    conversationId: string,
    runId: string,
    provider: string,
    model: string
  ) => `parallel:${conversationId}:${runId}:${provider}:${model}` as const,
 
  system: {
    broadcasts: "system:broadcasts",
    metrics: "system:metrics"
  }
} as const;
