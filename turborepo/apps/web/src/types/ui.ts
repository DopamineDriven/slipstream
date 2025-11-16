export interface KeyboardShortcut {
  action: string;
  keys: string[];
}

export type SidebarProps = {
  id: string;
  title: string;
  updatedAt: Date;
};
