import type React from "react"
import type { User } from "next-auth"
export interface ChatThread {
  id: string
  title: string
  lastMessageAt: string
}

export interface Model {
  id: string
  name: string
  icon?: string
}


export interface Message {

  id: string

  sender: "user" | "ai"

  text: string | React.ReactNode // Can be string for initial, ReactNode after processing

  originalText?: string // To store the raw markdown string for editing

  timestamp: string

  model?: string

  avatar?: string

  isEditing?: boolean

}

export interface UserProfile extends User {
  plan: "Free" | "Pro"
  messageUsage: {
    current: number
    limit: number
  }
}

export interface KeyboardShortcut {
  action: string
  keys: string[]
}
