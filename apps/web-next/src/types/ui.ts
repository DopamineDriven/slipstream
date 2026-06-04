import { User } from "@/utils/auth-client";

export interface KeyboardShortcut {
  action: string;
  keys: string[];
}

export type SidebarProps = {
  id: string;
  title: string;
  updatedAt: Date;
};

/**
 * The fully-client chat route hands the surface just its identity + the authed user; history hydrates client-side
 * via SWR (`useHydrateChatStore`) and all live state comes from the store/context — no server-seeded props.
 */
export interface ChatInterfaceProps {
  conversationId: string;
  user: User;
}
