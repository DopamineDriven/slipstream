"use client";

import type { User } from "next-auth";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input
} from "@t3-chat-clone/ui";
import { Label } from "@/ui/atoms/label";
import { Switch } from "@/ui/atoms/switch";

export function AttachmentsSettingsSection({ user }: { user?: User }) {
  return (
    <Card className="bg-brand-component border-brand-border text-brand-text">
      <CardHeader>
        <CardTitle className="text-brand-text-emphasis">
          Attachments & Uploads
        </CardTitle>
        <CardDescription className="text-brand-text-muted">
          {`${user?.name?.split(` `)[0]?.concat(", manage") ?? "Manage"} how attachments are handled and your upload preferences.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label
            htmlFor="max-upload-size"
            className="text-brand-text-muted font-medium">
            Max Upload Size per File
          </Label>
          <Input
            id="max-upload-size"
            type="text"
            defaultValue="10 MB (Pro Plan: 100MB)" // Example, could be dynamic
            disabled
            className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text"
          />
          <p className="text-brand-text-muted text-xs">
            Your current plan determines the maximum file size for uploads.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label
              htmlFor="auto-compress"
              className="text-brand-text-muted font-medium">
              Automatically Compress Images
            </Label>
            <p className="text-brand-text-muted text-xs">
              Reduce file size for faster uploads and less storage usage.
            </p>
          </div>
          <Switch
            id="auto-compress"
            defaultChecked
            className="data-[state=checked]:bg-brand-primary"
          />
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="allowed-file-types"
            className="text-brand-text-muted font-medium">
            Allowed File Types
          </Label>
          <Input
            id="allowed-file-types"
            type="text"
            defaultValue=".jpg, .png, .pdf, .docx, .webp" // Example
            disabled
            className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text"
          />
          <p className="text-brand-text-muted text-xs">
            These are the file types currently supported for attachments.
          </p>
        </div>

        <div>
          <h3 className="text-md text-brand-text-emphasis mb-2 font-medium">
            Storage Usage
          </h3>
          <div className="bg-brand-background border-brand-border text-brand-text rounded-md border p-3">
            <p className="text-sm">
              You've used <strong>2.5 GB</strong> of <strong>10 GB</strong>{" "}
              storage.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text">
          Manage Uploaded Files
        </Button>
      </CardContent>
    </Card>
  );
}
