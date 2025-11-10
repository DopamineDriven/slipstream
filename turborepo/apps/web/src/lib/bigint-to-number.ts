import type { MessageSingleton } from "@slipstream/types";

export function handleBigintToNumber(message: MessageSingleton<false>): MessageSingleton<true> {
  const { attachments, ...rest } = message;
  const mapIt = attachments.map(t => {
    const { size, ...p } = t;
    const mapProviderSingleton = p?.providerLinks?.map(v => {
      const { size, ...s } = v;
      return {
        size: size ? Number(size) : null,
        ...s
      };
    });
    return {
      ...p,
      size: size ? Number(size) : null,
      providerLinks: mapProviderSingleton
    };
  });
  return { attachments: mapIt, ...rest } satisfies MessageSingleton<true>;
}
