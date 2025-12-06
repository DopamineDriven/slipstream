import type {
  AttachmentProviderSingleton,
  MessageSingleton,
  ProviderStoreSingleton
} from "@slipstream/types";

export function handleBigintToNumber(
  message: MessageSingleton<false>
): MessageSingleton<true> {
  const { attachments, ...rest } = message;
  const mapIt = attachments.map(t => {
    const { size, ...p } = t;
    const mapProviderSingleton = p?.providerLinks?.map(v => {
      const { size, store, attachment: _att, ...s } = v;

      const { totalBytes, ...restStore } = store ?? {};
      return {
        size: size ? Number(size) : null,
        ...s,
        store: {
          ...restStore,
          totalBytes: totalBytes ? Number(totalBytes) : null
        } as ProviderStoreSingleton<true>
      } as AttachmentProviderSingleton<true>;
    });
    return {
      ...p,
      size: size ? Number(size) : null,
      providerLinks: mapProviderSingleton
    };
  });
  return { attachments: mapIt, ...rest } as MessageSingleton<true>;
}
