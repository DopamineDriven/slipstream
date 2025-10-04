import type { ReactNode } from "react";

export default function SettingsLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return <>{children}</>;
}
