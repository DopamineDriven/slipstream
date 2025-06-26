"use client";

import type React from "react";
import { Icon } from "@t3-chat-clone/ui";
import { useState } from "react";
import { motion } from "motion/react";
import { mockEmptyStatePrompts } from "@/lib/mock";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/atoms/tabs";
import type { User } from "next-auth";

interface EmptyStateChatProps {
  user?: User;
  onPromptSelect?: (prompt: string) => void;
  className?: string;
}

const iconMap: Record<string, React.ElementType> = {
  Create: Icon.PenLine,
  Explore: Icon.Compass,
  Code: Icon.Code,
  Learn: Icon.BookOpen
};

export function EmptyStateChat({
  user,
  onPromptSelect = prompt => console.log("Selected prompt:", prompt),
  className = ""
}: EmptyStateChatProps) {
  const [activeTab, setActiveTab] = useState(
    Object.keys(mockEmptyStatePrompts)[0]
  );
  

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`text-brand-text flex h-full flex-col items-center justify-center p-4 sm:p-8 ${className}`}>
      <Icon.Sparkles className="text-brand-primary mb-4 h-12 w-12 sm:mb-6 sm:h-16 sm:w-16" />
      <h1 className="text-brand-text-emphasis mb-3 text-center text-2xl font-semibold sm:mb-4 sm:text-3xl md:text-4xl">
        How can I help you, {user?.name ?? "username"}?
      </h1>

      <Tabs
        defaultValue={activeTab}
        onValueChange={setActiveTab}
        className="mt-8 w-full max-w-2xl">
        <TabsList className="bg-brand-component border-brand-border grid w-full grid-cols-2 gap-1 border sm:grid-cols-4">
          {Object.keys(mockEmptyStatePrompts).map(category => {
            const Icon = iconMap[category];
            return (
              <TabsTrigger
                key={category}
                value={category}
                className="data-[state=active]:bg-brand-primary data-[state=active]:text-brand-primaryForeground">
                {Icon && <Icon className="mr-2 h-4 w-4" />}
                {category}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {Object.entries(mockEmptyStatePrompts).map(([category, prompts]) => (
          <TabsContent key={category} value={category} className="mt-6">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
              {prompts.map((prompt, index) => (
                <motion.button
                  key={index}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onPromptSelect(prompt)}
                  className="bg-brand-component hover:bg-brand-sidebar border-brand-border text-brand-text-muted hover:text-brand-text rounded-lg border p-3 text-left text-sm transition-all sm:p-4">
                  {prompt}
                </motion.button>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </motion.div>
  );
}
