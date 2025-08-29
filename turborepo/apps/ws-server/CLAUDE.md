Looking at your scenario, you'll want to handle both cases gracefully. The Anthropic SDK's `ImageBlockParam` supports both URL and base64 sources, which maps perfectly to your race condition scenario.

Here's how I'd approach modifying your `formatAnthropicHistory` to handle images:

```ts
import { 
  MessageParam, 
  TextBlockParam, 
  ImageBlockParam,
  ContentBlock 
} from '@anthropic-ai/sdk/resources';

interface MessageAttachment {
  type: 'image';
  s3Url?: string;        // Available after S3 upload completes
  base64Data?: string;   // Fallback raw data
  mimeType: string;      // e.g., 'image/jpeg', 'image/png'
}

interface Message {
  senderType: "USER" | "ASSISTANT";
  content: string;
  attachments?: MessageAttachment[];
  provider?: string;
  model?: string;
}

public formatAnthropicHistory(
  isNewChat: boolean,
  msgs: Message[],
  userPrompt: string,
  userAttachments?: MessageAttachment[],
  systemPrompt?: string
) {
  const createImageBlock = (attachment: MessageAttachment): ImageBlockParam => {
    // Prefer S3 URL if available, fallback to base64
    if (attachment.s3Url) {
      return {
        type: 'image',
        source: {
          type: 'url',
          url: attachment.s3Url
        }
      };
    } else if (attachment.base64Data) {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: attachment.mimeType,
          data: attachment.base64Data
        }
      };
    } else {
      throw new Error('Image attachment has neither URL nor base64 data');
    }
  };

  const formatMessageContent = (
    content: string, 
    attachments?: MessageAttachment[]
  ): string | ContentBlock[] => {
    if (!attachments || attachments.length === 0) {
      // Simple string content for text-only messages
      return content;
    }

    // Mixed content array for messages with attachments
    const blocks: ContentBlock[] = [];
    
    // Add text content if present
    if (content.trim()) {
      blocks.push({
        type: 'text',
        text: content
      } as TextBlockParam);
    }

    // Add image blocks
    for (const attachment of attachments) {
      blocks.push(createImageBlock(attachment));
    }

    return blocks;
  };

  if (!isNewChat) {
    const messages = msgs.map(msg => {
      if (msg.senderType === "USER") {
        return { 
          role: "user", 
          content: formatMessageContent(msg.content, msg.attachments)
        } as const;
      } else {
        // Assistant messages with model tagging
        const provider = msg.provider?.toLowerCase() ?? "";
        const model = msg.model ?? "";
        const taggedContent = `<model provider="${provider}" name="${model}">\n${msg.content}\n</model>`;
        
        return {
          role: "assistant",
          content: formatMessageContent(taggedContent, msg.attachments)
        } as const;
      }
    }) satisfies MessageParam[];

    const enhancedSystemPrompt = systemPrompt
      ? `${systemPrompt}\n\nNote: Previous responses may be tagged with their source model for context.`
      : "Previous responses in this conversation may be tagged with their source model for context.";

    return {
      messages,
      system: [
        { type: "text", text: enhancedSystemPrompt }
      ] as const satisfies TextBlockParam[]
    };
  } else {
    // New chat - include any user attachments with the first message
    const messages = [
      { 
        role: "user", 
        content: formatMessageContent(userPrompt, userAttachments)
      }
    ] as const satisfies MessageParam[];

    if (systemPrompt) {
      return {
        messages,
        system: [
          { type: "text", text: systemPrompt }
        ] as const satisfies TextBlockParam[]
      };
    } else {
      return {
        messages,
        system: undefined
      };
    }
  }
}
```

Key points about this approach:

1. **Graceful fallback**: The `createImageBlock` function checks for S3 URL first, then falls back to base64. This handles your race condition elegantly.

2. **Content flexibility**: Messages can be either a simple string (text-only) or an array of content blocks (mixed content). The SDK handles both formats.

3. **MIME type handling**: Make sure to include the correct `media_type` when using base64. Common values are `image/jpeg`, `image/png`, `image/gif`, and `image/webp`.

4. **Performance consideration**: Base64 encoding increases the payload size by ~33%, so you might want to implement a timeout/retry mechanism:

```ts
const waitForS3Url = async (
  attachmentId: string, 
  maxWaitMs: number = 3000
): Promise<string | null> => {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const url = await checkS3Status(attachmentId);
    if (url) return url;
    await new Promise(r => setTimeout(r, 100)); // Poll every 100ms
  }
  return null; // Timeout - use base64 fallback
};
```

This way, you give the S3 upload a reasonable chance to complete before falling back to base64, balancing latency with efficiency.
