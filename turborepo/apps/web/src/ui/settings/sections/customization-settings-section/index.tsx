"use client";

import {
  Card,
  CardContent,
  CardDescription,
  Label,
  Switch,
  CardHeader,
  CardTitle
} from "@t3-chat-clone/ui";
import dynamic from "next/dynamic";


const ThemeToggle = dynamic(
  () => import("@/ui/theme-toggle").then(d => d.ThemeToggle),
  { ssr: false }
);
// TODO revisit with database-synced preferences for theme etc
export function CustomizationSettingsSection() {
  return (
    <Card className="bg-brand-component border-brand-border text-brand-text">
      <CardHeader>
        <CardTitle className="text-brand-text-emphasis">Appearance</CardTitle>
        <CardDescription className="text-brand-text-muted">
          Customize the look and feel of the application.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label
              htmlFor="theme-mode"
              className="text-brand-text-muted font-medium">
              Theme Mode
            </Label>
            <p className="text-brand-text-muted text-xs">
              Select your preferred light or dark theme.
            </p>
          </div>
          <ThemeToggle id="theme-mode" />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label
              htmlFor="compact-mode"
              className="text-brand-text-muted font-medium">
              Compact Mode
            </Label>
            <p className="text-brand-text-muted text-xs">
              Reduce padding and margins for a more condensed view.
            </p>
          </div>
          <Switch
            id="compact-mode"
            className="data-[state=checked]:bg-brand-primary"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label
              htmlFor="font-size"
              className="text-brand-text-muted font-medium">
              Font Size
            </Label>
            <p className="text-brand-text-muted text-xs">
              Adjust the default font size for readability.
            </p>
          </div>
          {/* Placeholder for font size selector - e.g., a Select component */}
          <span className="text-brand-text-muted text-sm">Default</span>
        </div>
      </CardContent>
    </Card>
  );
}
