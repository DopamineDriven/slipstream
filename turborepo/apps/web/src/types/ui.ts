import type { Message as MessagePrisma } from "@prisma/client";
import type { ComponentPropsWithRef, JSX } from "react";
import React from "react";

export interface Model {
  id: string;
  name: string;
  icon?: ({
    ...svg
  }: Omit<
    ComponentPropsWithRef<"svg">,
    "viewBox" | "fill" | "xmlns" | "role"
  >) => JSX.Element;
}

export interface MessageUI
  extends Omit<MessagePrisma, "createdAt" | "updatedAt" | "provider"> {
  provider: "grok" | "openai" | "gemini" | "anthropic";
  createdAt: string;
  updatedAt: string;
  text: string | React.ReactNode;

  originalText?: string;

  timestamp: string;

  avatar?: string;

  isEditing?: boolean;
}

export interface KeyboardShortcut {
  action: string;
  keys: string[];
}

export type SidebarProps ={
  id: string;
  title: string;
  updatedAt: Date;
}
