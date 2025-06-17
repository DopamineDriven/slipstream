"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Icon,
  Input
} from "@t3-chat-clone/ui";
import { motion } from "motion/react";

interface ApiKeysTabProps {
  isProUser?: boolean; // To control the Pro feature display
  className?: string;
}

export function ApiKeysTab({
  isProUser = false,
  className = ""
}: ApiKeysTabProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      <Card className="bg-brand-component border-brand-border text-brand-text">
        <CardHeader>
          <CardTitle className="text-brand-text-emphasis">API Keys</CardTitle>
          <CardDescription className="text-brand-text-muted">
            Bring your own API keys for select models. This allows for higher usage limits and access to specific model
            versions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isProUser ? (
            <>
              <div className="space-y-2">
                <label htmlFor="openai-key" className="text-sm font-medium text-brand-text-muted">
                  OpenAI API Key
                </label>
                <div className="flex flex-col sm:flex-row sm:space-x-2 space-y-2 sm:space-y-0">
                  <Input
                    id="openai-key"
                    type="password"
                    placeholder="sk-************************************************"
                    className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text"
                  />
                  <Button
                    variant="outline"
                    className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text"
                  >
                    Save
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="anthropic-key" className="text-sm font-medium text-brand-text-muted">
                  Anthropic API Key
                </label>
                <div className="flex flex-col sm:flex-row sm:space-x-2 space-y-2 sm:space-y-0">
                  <Input
                    id="anthropic-key"
                    type="password"
                    placeholder="sk-ant-*******************************************"
                    className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text"
                  />
                  <Button
                    variant="outline"
                    className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text"
                  >
                    Save
                  </Button>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text"
              >
                <Icon.CirclePlus className="mr-2 h-4 w-4" /> Add another model key
              </Button>
            </>
          ) : (
            <div className="text-center p-4 sm:p-8 border-2 border-dashed border-brand-border rounded-lg bg-brand-sidebar">
              <Icon.KeyRound className="mx-auto h-12 w-12 text-brand-primary mb-4" />
              <h3 className="text-lg sm:text-xl font-semibold text-brand-text-emphasis">Pro Feature</h3>
              <p className="text-sm text-brand-text-muted mt-1 mb-3 sm:mt-2 sm:mb-4">
                Managing your own API keys is a Pro feature. Upgrade to unlock this and other benefits.
              </p>
              <Button className="bg-brand-primary text-brand-primaryForeground hover:bg-brand-primary/90">
                Upgrade to Pro - $8/month
              </Button>
            </div>
          )}
        </CardContent>
        <CardFooter className="text-xs text-brand-text-muted">
          Your API keys are stored securely and only used to communicate with the respective model providers.
        </CardFooter>
      </Card>
    </motion.div>
  )
}

interface ApiKeysTabPropss {
  isProUser?: boolean // To control the Pro feature display
  className?: string
}

export function ApiKeysTabs({ isProUser = false, className = "" }: ApiKeysTabPropss) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      <Card className="bg-brand-component border-brand-border text-brand-text">
        <CardHeader>
          <CardTitle className="text-brand-text-emphasis">API Keys</CardTitle>
          <CardDescription className="text-brand-text-muted">
            Bring your own API keys for select models. This allows for higher usage limits and access to specific model
            versions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isProUser ? (
            <>
              <div className="space-y-2">
                <label htmlFor="openai-key" className="text-sm font-medium text-brand-text-muted">
                  OpenAI API Key
                </label>
                <div className="flex flex-col sm:flex-row sm:space-x-2 space-y-2 sm:space-y-0">
                  <Input
                    id="openai-key"
                    type="password"
                    placeholder="sk-************************************************"
                    className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text"
                  />
                  <Button
                    variant="outline"
                    className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text"
                  >
                    Save
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="anthropic-key" className="text-sm font-medium text-brand-text-muted">
                  Anthropic API Key
                </label>
                <div className="flex flex-col sm:flex-row sm:space-x-2 space-y-2 sm:space-y-0">
                  <Input
                    id="anthropic-key"
                    type="password"
                    placeholder="sk-ant-*******************************************"
                    className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text"
                  />
                  <Button
                    variant="outline"
                    className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text"
                  >
                    Save
                  </Button>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text"
              >
                <Icon.CirclePlus className="mr-2 h-4 w-4" /> Add another model key
              </Button>
            </>
          ) : (
            <div className="text-center p-4 sm:p-8 border-2 border-dashed border-brand-border rounded-lg bg-brand-sidebar">
              <Icon.KeyRound className="mx-auto h-12 w-12 text-brand-primary mb-4" />
              <h3 className="text-lg sm:text-xl font-semibold text-brand-text-emphasis">Pro Feature</h3>
              <p className="text-sm text-brand-text-muted mt-1 mb-3 sm:mt-2 sm:mb-4">
                Managing your own API keys is a Pro feature. Upgrade to unlock this and other benefits.
              </p>
              <Button className="bg-brand-primary text-brand-primaryForeground hover:bg-brand-primary/90">
                Upgrade to Pro - $8/month
              </Button>
            </div>
          )}
        </CardContent>
        <CardFooter className="text-xs text-brand-text-muted">
          Your API keys are stored securely and only used to communicate with the respective model providers.
        </CardFooter>
      </Card>
    </motion.div>
  )
}
