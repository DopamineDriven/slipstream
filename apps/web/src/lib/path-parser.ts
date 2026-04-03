// eslint-disable-next-line no-useless-escape
export const re = /^\/chat\/(?<target>[^\/?]+)(?:\?prompt=(?<prompt>.*))?$/;

export function pathParser(path: string): {
    conversationId?: string;
    prompt?: string;
} {
  const m = path.match(re);
  if (!m?.groups || !("target" in m.groups))
    return {
      conversationId: undefined,
      prompt: undefined
    };
  else {
    if (!("prompt" in m.groups)) {
      return {
        conversationId: m?.groups.target,
        prompt: undefined
      };
    } else {
      return {
        conversationId: m.groups.target,
        prompt: m.groups.prompt
      };
    }
  }
}
