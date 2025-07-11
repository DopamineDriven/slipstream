"use client";

// import { getDecryptedApiKeyOnEdit, upsertApiKey } from "@/app/actions/api-key";
import type { Providers } from "@t3-chat-clone/types";
import { motion } from "motion/react";
// import { useSession } from "next-auth/react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CirclePlus,
  Input
} from "@t3-chat-clone/ui";

interface ApiKeysTabPropss {
  isProUser?: boolean; // To control the Pro feature display
  className?: string;
}

const _providerObj = [
  {
    provider: "anthropic",
    text: "Anthropic Api Key",
    icon: "https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/public/claude-ai-icon.svg"
  },
  {
    provider: "gemini",
    text: "Gemini Api Key",
    icon: "https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/public/google-gemini-icon.svg"
  },
  {
    provider: "grok",
    text: "Grok Api Key",
    icon: "https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/public/grok-icon.svg"
  },
  {
    provider: "openai",
    text: "OpenAI Api Key",
    icon: "https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/public/chatgpt-icon.svg"
  }
] as const satisfies readonly ({provider: Providers; text: string; icon: string;})[];
export function ApiKeysTab({
  className = ""
}: ApiKeysTabPropss) {
  // const { data: session } = useSession();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={className}>
      <Card className="bg-brand-component border-brand-border text-brand-text">
        <CardHeader>
          <CardTitle className="text-brand-text-emphasis">API Keys</CardTitle>
          <CardDescription className="text-brand-text-muted">
            Bring your own API keys for select models. This allows for higher
            usage limits and access to specific model versions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
       <>
              <div className="space-y-2">
                <label
                  htmlFor="openai-key"
                  className="text-brand-text-muted text-sm font-medium">
                  OpenAI API Key
                </label>
                <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                  <Input
                    id="openai-key"
                    type="password"
                    inputMode="text"
                    placeholder="sk-************************************************"
                    className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text"
                  />
                  <Button
                    variant="outline"
                    className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text">
                    Save
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="anthropic-key"
                  className="text-brand-text-muted text-sm font-medium">
                  Anthropic API Key
                </label>
                <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                  <Input
                    id="anthropic-key"
                    type="password"
                    placeholder="sk-ant-*******************************************"
                    className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text"
                  />
                  <Button
                    variant="outline"
                    className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text">
                    Save
                  </Button>
                </div>
              </div>
              <Button
                variant="outline"
                className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text w-full">
                <CirclePlus className="mr-2 h-4 w-4" /> Add another model
                key
              </Button>
            </>
        </CardContent>
        <CardFooter className="text-brand-text-muted text-xs">
          Your API keys are stored securely and only used to communicate with
          the respective model providers.
        </CardFooter>
      </Card>
    </motion.div>
  );
}
