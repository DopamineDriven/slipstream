import React from "react"
import type { ComponentPropsWithRef, JSX } from "react";


export interface Model {
  id: string
  name: string
  icon?: ({ ...svg }: Omit<ComponentPropsWithRef<"svg">, "viewBox" | "fill" | "xmlns" | "role">) => JSX.Element;
}


export interface Message {

  id: string

  sender: "user" | "ai"

  text: string | React.ReactNode

  originalText?: string

  timestamp: string

  model?: string

  avatar?: string

  isEditing?: boolean

}


export interface KeyboardShortcut {
  action: string
  keys: string[]
}
