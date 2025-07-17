import React from "react"
import type { ComponentPropsWithRef, JSX } from "react";
import type { Message as MessagePrisma } from "@prisma/client";


export interface Model {
  id: string
  name: string
  icon?: ({ ...svg }: Omit<ComponentPropsWithRef<"svg">, "viewBox" | "fill" | "xmlns" | "role">) => JSX.Element;
}


export interface Message  extends Omit<MessagePrisma, "createdAt"|"updatedAt"|"provider">{
provider: "grok" | "openai" | "gemini" | "anthropic";
createdAt: string;
updatedAt: string;
  text: string | React.ReactNode

  originalText?: string

  timestamp: string


  avatar?: string

  isEditing?: boolean

}


export interface KeyboardShortcut {
  action: string
  keys: string[]
}
