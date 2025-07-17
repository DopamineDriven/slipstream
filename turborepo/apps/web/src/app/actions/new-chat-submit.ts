"use server"
import { redirect } from "next/navigation"
export async function handlePromptSubmission(formData: FormData) {

  const prompt = formData.get("prompt") as string

  if (!prompt?.trim()) {
    return
  }

  // Redirect to your dynamic route with "new-chat" as the conversationId
  const encodedPrompt = encodeURIComponent(prompt.trim());

  redirect(`/chat/new-chat?prompt=${encodedPrompt}`);
}
