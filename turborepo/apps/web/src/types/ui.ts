import { User } from "@/utils/auth-client";
import { MessageSingleton, Provider } from "@slipstream/types";

export interface KeyboardShortcut {
  action: string;
  keys: string[];
}

export type SidebarProps = {
  id: string;
  title: string;
  updatedAt: Date;
};
export interface ChatInterfaceProps {
  initialMessages?: MessageSingleton<true>[] | null;
  conversationTitle?: string | null;
  conversationId: string; // From the dynamic route param - not used, context drives everything
  user: User;
  lastModel?: string | null;
  lastProvider?: Provider | null;
}
