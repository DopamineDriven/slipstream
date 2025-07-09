"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label
} from "@t3-chat-clone/ui";
import Image from "next/image";
import { availableModels } from "@/lib/mock"; // Assuming models data is here

// TODO revisit with database-synced model offerings (exact specifity)
export function ModelsSettingsSection() {
  return (
    <Card className="bg-brand-component border-brand-border text-brand-text">
      <CardHeader>
        <CardTitle className="text-brand-text-emphasis">
          Model Preferences
        </CardTitle>
        <CardDescription className="text-brand-text-muted">
          Manage and configure your preferred AI models.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-brand-text-emphasis mb-2 text-lg font-medium">
            Default Model
          </h3>
          <p className="text-brand-text-muted mb-3 text-sm">
            Select the default model to be used for new chats.
          </p>
          {/* Placeholder for a Select component or RadioGroup */}
          <div className="bg-brand-background border-brand-border text-brand-text rounded-md border p-3">
            Currently: {availableModels[0]?.name ?? ""} (Gemini 2.5 Flash)
          </div>
        </div>

        <div>
          <h3 className="text-brand-text-emphasis mb-2 text-lg font-medium">
            Model Access & Limits
          </h3>
          <p className="text-brand-text-muted mb-3 text-sm">
            View your access levels and usage limits for different models. Some
            models may require specific API keys (manageable in the API Keys
            section).
          </p>
          <div className="space-y-3">
            {availableModels.map(model => (
              <div
                key={model.id}
                className="bg-brand-background border-brand-border flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center">
                  {model.icon && (
                    <Image
                      src={model.icon || "/placeholder.svg"}
                      alt={`${model.name} logo`}
                      width={20}
                      height={20}
                      className="mr-2 rounded-sm"
                    />
                  )}
                  <span className="text-brand-text">{model.name}</span>
                </div>
                <span className="text-brand-text-muted text-xs">
                  Default Access
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="custom-instructions"
            className="text-brand-text-muted font-medium">
            Custom Instructions for Models
          </Label>
          <Input
            id="custom-instructions"
            placeholder="e.g., Always respond in a formal tone."
            className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text"
          />
          <Button className="bg-brand-primary text-brand-primaryForeground hover:bg-brand-primary/90 mt-2">
            Save Instructions
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
