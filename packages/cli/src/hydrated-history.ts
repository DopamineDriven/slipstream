import type {
  FormatHydratedTailOptions,
  FormattedHydratedTail,
  FormattedTailMessage,
  HydratedTailPage
} from "@/types.ts";
import { MessageBlocksService } from "@/message-blocks.ts";

export class FormatHydratedTailService extends MessageBlocksService {
  constructor(wsUrl?: string) {
    super(wsUrl);
  }

  public formatHydratedTail(
    pages: HydratedTailPage[],
    options: FormatHydratedTailOptions
  ) {
    const all = pages
      .flatMap(page => page.convo.messages)
      .sort((a, b) => a.ordinal - b.ordinal);
    const title = pages[0]?.convo.title ?? null;
    const tail = options.tailCount > 0 ? all.slice(-options.tailCount) : [];

    const messages = tail.map(msg => {
      const full = this.messageAnswerText(msg);
      const totalChars = full.length;
      const truncated = totalChars > options.perMessageCharCap;
      return {
        ordinal: msg.ordinal,
        senderType: msg.senderType,
        provider: msg.provider,
        model: msg.model,
        body: truncated ? full.slice(0, options.perMessageCharCap) : full,
        truncated,
        totalChars
      } satisfies FormattedTailMessage;
    });

    return {
      title,
      messages,
      totalHydrated: all.length,
      shownFromOrdinal: messages[0]?.ordinal ?? null,
      shownToOrdinal: messages[messages.length - 1]?.ordinal ?? null
    } satisfies FormattedHydratedTail;
  }
}
