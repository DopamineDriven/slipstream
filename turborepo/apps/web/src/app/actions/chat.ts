'use server'
import { prismaClient as _prismaClient } from '@/lib/prisma'

// export async function saveAiChatMessage({
//   conversationId,
//   userId,
//   userPrompt,
//   aiResponse,
//   provider,
//   model,
// }: {
//   conversationId?: string,
//   userId: string,
//   userPrompt: string,
//   aiResponse: string,
//   provider: string,
//   model: string
// }) {
//   if (!conversationId) {
//   // Persist user message

// return;
// }
