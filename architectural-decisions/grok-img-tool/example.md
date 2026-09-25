reference: [](../../apps/ws-server/src/prisma/chat-request.ts) L 998-1027

for the mapping to work, we'd need to access `AttachmentSingleton<true>[]` in full under both message.attachments and imageBlock.attachments:



```ts
private async handleAiChatReqUpdateSansAttachmentsWithAudioGen({
  apiKey,
  conversationId,
  keyId,
  messageData,
  update,
  userId
}: HandleAiChatReqUpdateWithAudioGenSansAttachmentsProps) {
  const conversationSettings = {
    update
  } as const;

  const ordinal = await this.convoCount(conversationId);
  const pr = await this.prismaClient.conversation.update({
    include: {
      conversationSettings: true,
      messages: {
        orderBy: { ordinal: "asc" },
        include: {
          imageGenJob: true,
          audioGenJob: true,
          messageBlocks: {
            orderBy: { ordinal: "asc" },
            include: {
              where: {
                OR: [
                  { origin: { not: "GENERATED" } },
                  {
                    AND: [
                      { origin: "GENERATED" },
                      { imageGenOutput: { kind: "FINAL" } }
                    ]
                  }
                ]
              },
              attachments: {
                include: this.includeGamma.include
              }
            }
          },
          attachments: {
            where: {
              OR: [
                { origin: { not: "GENERATED" } },
                {
                  AND: [
                    { origin: "GENERATED" },
                    { imageGenOutput: { kind: "FINAL" } }
                  ]
                }
              ]
            },
            orderBy: { createdAt: "asc" },
            include: this.includeGamma.include
          }
        }
      }
    },
    where: { id: conversationId },
    data: {
      messages: {
        create: {
          ...messageData,
          ordinal,
          messageBlocks: {
            create: {
              content: messageData.content,
              conversationId,
              ordinal: 0,
              type: "TEXT"
            }
          }
        }
      },
      conversationSettings,
      userId,
      userKeyId: keyId
    }
  });

  const { messages, ...c } = pr;
  const s = messages.map(p => {
    const { attachments, messageBlocks, ...rest } = p;
    const msgBlocks = messageBlocks.map(t => {
      let a: AttachmentSingleton<true>[] | undefined = undefined;
      const { attachments, ...rest } = t;
      if (attachments) {
        a = attachments.map(v => {
          return {
            ...v,
            size: v.size ? Number(v.size) : null,
            inlineImageGenOutput: v.inlineImageGenOutput ?? undefined
          };
        });
      } else {
        a = undefined;
      }
      return {
        attachments: a,
        ...rest
      } satisfies MessageBlockSingleton<true>;
    });
    const att = attachments.map(v => {
      return {
        ...v,
        size: v.size ? Number(v.size) : null,
        inlineImageGenOutput: v.inlineImageGenOutput ?? undefined
      };
    });

    return {
      ...rest,
      messageBlocks: msgBlocks,
      attachments: att
    };
  });

  const conversation = {
    ...c,
    messages: s,
    apiKey
  } satisfies ConversationSingletonOneOff<true>;
  const lastMsg = conversation.messages.at(-1);
  return this.toCompatPropsExtened("audio_gen_request", conversation, {
    jobId: lastMsg?.audioGenJob?.id,
    requestMessageId: lastMsg?.id,
    assetCounts: 0,
    assets: undefined
  });
}
```

  where `this.includeGamma.include` is equal to:

```ts
private get includeGamma() {
  return {
    include: {
      image: true,
      audioGenOutput: true,
      document: true,
      audio: true,
      imageGenOutput: true,
      inlineImageGenOutput: true
    }
  } as const;
}
```
