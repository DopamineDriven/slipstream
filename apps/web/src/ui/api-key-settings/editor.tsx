"use client";

import type { ProviderRosterEntry } from "@/ui/api-key-settings/types";
import type { ApiKeySubmissionState } from "@/ui/atoms/multi-state-submission-badge";
import type { RefObject, SubmitEvent } from "react";
import { MultiStateApiKeySubmissionBadge } from "@/ui/atoms/multi-state-submission-badge";
import { Button, Eye, EyeOff, Input, Label, Switch, X } from "@slipstream/ui";

export type EditorMode = "add" | "edit";

/** the ONE editor's ephemeral draft — owned by the tab, rendered here */
export interface EditorState {
  readonly provider: ProviderRosterEntry["provider"];
  readonly mode: EditorMode;
  readonly value: string;
  /** "" for add; the revealed plaintext for edit (drives hasChanges) */
  readonly original: string;
  readonly isDefault: boolean;
  readonly originalDefault: boolean;
  readonly masked: boolean;
  /** user-facing copy from the last failed submit for this draft */
  readonly error: string | null;
}

interface ApiKeyEditorProps {
  readonly entry: ProviderRosterEntry;
  readonly editor: EditorState;
  readonly badgeState: ApiKeySubmissionState;
  /** true while the action or the ack is in flight — locks the controls */
  readonly busy: boolean;
  readonly canSave: boolean;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onValueChange: (value: string) => void;
  readonly onDefaultChange: (isDefault: boolean) => void;
  readonly onToggleMask: () => void;
  readonly onCancel: () => void;
  readonly onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}

export function ApiKeyEditor({
  entry,
  editor,
  badgeState,
  busy,
  canSave,
  inputRef,
  onValueChange,
  onDefaultChange,
  onToggleMask,
  onCancel,
  onSubmit
}: ApiKeyEditorProps) {
  const inputId = `${entry.provider}-key`;
  const switchId = `default-${entry.provider}`;
  return (
    <form
      id={`form-${entry.provider}`}
      onSubmit={onSubmit}
      className="space-y-4 pl-7">
      <div className="flex flex-col space-y-3 lg:flex-row lg:space-y-0 lg:space-x-3">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            id={inputId}
            name="apiKey"
            type={editor.masked ? "password" : "text"}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={entry.placeholder}
            value={editor.value}
            onChange={e => onValueChange(e.target.value)}
            disabled={busy}
            aria-invalid={editor.error !== null}
            aria-describedby={editor.error ? `${inputId}-error` : undefined}
            className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text pr-12"
            required
          />
          <div className="absolute top-1/2 right-2 -translate-y-1/2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleMask}
              disabled={busy}
              aria-pressed={!editor.masked}
              aria-label={`${editor.masked ? "Show" : "Hide"} ${entry.text} API key`}
              className="hover:bg-brand-primary/20 h-8 w-8 p-0">
              {editor.masked ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-3 lg:flex-col lg:space-y-3 lg:space-x-0 xl:flex-row xl:space-y-0 xl:space-x-3">
          {/* no onClick: the badge is a <button> inside the form, so it submits natively */}
          <MultiStateApiKeySubmissionBadge
            state={badgeState}
            context={editor.mode === "edit" ? "update" : "add"}
            disabled={!canSave}
            className="flex-1 sm:flex-none lg:flex-1 xl:flex-none"
          />
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
            className="bg-brand-sidebar border-brand-border text-brand-text min-h-11 flex-1 hover:bg-red-500/20 sm:flex-none lg:flex-1 xl:flex-none">
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <Switch
          id={switchId}
          checked={editor.isDefault}
          onCheckedChange={onDefaultChange}
          disabled={busy}
        />
        <Label htmlFor={switchId} className="text-brand-text-muted text-sm">
          Set as default provider
        </Label>
      </div>

      {editor.error && (
        <div
          id={`${inputId}-error`}
          role="alert"
          className="text-sm text-red-500">
          {editor.error}
        </div>
      )}
    </form>
  );
}
