const CONVERSATION_PATH = /^\/chat\/([^/]+)\/?$/;

export function conversationIdFromUrl(url: URL) {
  if (url.pathname === "/") return "home";
  const match = CONVERSATION_PATH.exec(url.pathname);
  const encoded = match?.[1];
  return encoded === undefined ? undefined : decodeURIComponent(encoded);
}
const ATTACHMENT_PATH = /^\/attachment\/([^/]+)\/?$/;

export function attachmentIdFromUrl(url: URL) {
  const id = ATTACHMENT_PATH.exec(url.pathname)?.[1];
  return id === undefined ? undefined : decodeURIComponent(id);
}
