"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@t3-chat-clone/ui";

export function HistorySettingsSection() {
  return (
    <Card className="bg-brand-component border-brand-border text-brand-text">
      <CardHeader>
        <CardTitle className="text-brand-text-emphasis">
          Chat History & Sync
        </CardTitle>
        <CardDescription className="text-brand-text-muted">
          Manage your chat history and synchronization settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-brand-text-muted text-sm">
          Your chat history is automatically saved. You can export or delete
          your history here.
        </p>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text">
            Export History
          </Button>
          <Button variant="destructive">Delete All History</Button>
        </div>
      </CardContent>
    </Card>
  );
}
