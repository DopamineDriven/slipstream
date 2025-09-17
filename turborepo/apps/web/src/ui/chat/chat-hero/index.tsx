// src/ui/chat/dynamic/index.tsx
"use client";

import type { ModelSelection } from "@/lib/models";
import type { User } from "next-auth";
import { Logo } from "@/ui/logo";
import { motion } from "motion/react";
import {
  Card,
  CardContent,
  Code,
  FileText,
  MessageSquare,
  Sparkles
} from "@slipstream/ui";

const suggestedPrompts = [
  {
    icon: Code,
    title: "AI Coding Starter",
    prompt:
      "What's the best way to get started with AI-assisted programming? Suggest tools, languages, and simple projects."
  },
  {
    icon: FileText,
    title: "Templatize",
    prompt:
      "Help me draft up a professional email template that I can send to clients about project updates."
  },
  {
    icon: MessageSquare,
    title: "Brainstorm Ideas",
    prompt:
      "Generate creative marketing ideas for novel AI integrations into everyday products."
  },
  {
    icon: Sparkles,
    title: "Explain Concepts",
    prompt:
      "Explain quantum computing in simple terms that a beginner can understand."
  }
];
function getTimeOfDay(tz = "america/chicago", username?: string | null) {
  const time = new Date(Date.now()).toLocaleTimeString("en-US", {
    timeZone: decodeURIComponent(tz),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const u = username ? username.split(" ")?.[0] : "User";
  const [hour, _min, _sec] = time.split(/:/).map(t => Number.parseInt(t));
  if (!hour) return `What's on your mind, ${u}?`;
  else if (hour >= 5 && hour < 12)
    return `What's on your mind this morning, ${u}?`;
  else if (hour >= 12 && hour < 17) return `What's on your mind today, ${u}?`;
  else if (hour >= 17 && hour <= 23)
    return `What's on your mind tonight, ${u}?`;
  else return `Hello Nightowl!`;
}
export function ChatHero({
  user,
  selectedModel,
  tz,
  onPromptClickAction
}: {
  user: User;
  selectedModel: ModelSelection;
  tz?: string;
  onPromptClickAction: (prompt: string) => void;
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8 text-center">
        <Logo className="mx-auto mb-4 size-12 stroke-current text-current sm:size-16 [&_path]:stroke-current" />
        <h1 className="text-foreground/90 mb-2 text-xl font-bold">
          {getTimeOfDay(tz, user.name)}
        </h1>
        <p className="text-muted-foreground text-lg">
          {`Start a conversation with ${selectedModel.displayName}`}
        </p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="hidden md:mb-8 md:grid md:w-full md:max-w-2xl md:grid-cols-2 md:gap-4">
        {suggestedPrompts.map(item => (
          <Card
            key={item.title.split(/\W+/).join("-").toLowerCase()}
            className="hover:bg-accent/50 bg-card cursor-pointer border transition-colors"
            onClick={() => onPromptClickAction(item.prompt)}>
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <item.icon className="text-primary mt-0.5 size-5 flex-shrink-0" />
                <div>
                  <h3 className="text-foreground mb-1 font-medium">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground text-sm">{item.prompt}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>
    </>
  );
}
