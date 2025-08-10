import type { Message } from "@/generated/client/client.ts";
import type { Content, ContentUnion } from "@google/genai";
import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  private defaultClient: GoogleGenAI;

  constructor(private apiKey: string) {
    this.defaultClient = new GoogleGenAI({
      apiKey: this.apiKey,
      apiVersion: "v1alpha"
    });
  }

  public getClient(overrideKey?: string) {
    if (overrideKey) {
      return new GoogleGenAI({ apiKey: overrideKey, apiVersion: "v1alpha" });
    }
    return this.defaultClient;
  }

  private formatHistoryForSession(msgs: Message[]) {
    return msgs.map((msg): Content => {
      if (msg.senderType === "USER") {
        return { role: "user", parts: [{ text: msg.content }] };
      } else {
        // This is an assistant/model message. Prepend context.
        const provider = msg.provider.toLowerCase();
        const model = msg.model ?? "unknown";
        const modelIdentifier = `[${provider}/${model}]`;
        return {
          role: "model",
          parts: [{ text: `${modelIdentifier}\n${msg.content}` }]
        };
      }
    }) satisfies Content[];
  }

  /**
   * Formats the system prompt with a contextual note for continued conversations.
   */
  private formatSystemInstruction(isNewChat: boolean, systemPrompt?: string) {
    if (isNewChat) {
      return systemPrompt;
    }

    const note =
      "Note: Previous responses in this conversation may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";

    return (
      systemPrompt ? `${systemPrompt}\n\n${note}` : note
    ) satisfies ContentUnion;
  }

  public getHistoryAndInstruction(
    isNewChat: boolean,
    msgs: Message[],
    systemPrompt?: string
  ) {
    const systemInstruction = this.formatSystemInstruction(
      isNewChat,
      systemPrompt
    );
    if (isNewChat) {
      return {
        history: undefined,
        systemInstruction
      };
    } else {
      const historyMsgs = msgs.slice(0, -1);
      return {
        history: this.formatHistoryForSession(historyMsgs),
        systemInstruction
      };
    }
  }
}
