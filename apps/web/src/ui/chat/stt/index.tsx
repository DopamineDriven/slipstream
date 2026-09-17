"use client";

import { useId } from "react";
import { Drawer } from "@/ui/chat/stt/drawer";
import { LanguagePicker } from "@/ui/chat/stt/language-picker";
import type { STTTypes } from "@slipstream/types";

export interface LanguageSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: STTTypes.Web.LanguageSelection;
  onChange: (language: STTTypes.Web.LanguageSelection) => void;
  languages: STTTypes.Web.LanguageOption[];
}

export function LanguageSettings({
  open,
  onOpenChange,
  value,
  onChange,
  languages
}: LanguageSettingsProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      labelledBy={titleId}
      describedBy={descriptionId}>
      <LanguagePicker
        value={value}
        languages={languages}
        titleId={titleId}
        descriptionId={descriptionId}
        onClose={() => onOpenChange(false)}
        onApply={language => {
          onChange(language);
          onOpenChange(false);
        }}
      />
    </Drawer>
  );
}
