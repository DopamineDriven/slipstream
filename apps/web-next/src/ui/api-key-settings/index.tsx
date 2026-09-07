"use client";

import type { EditorState } from "@/ui/api-key-settings/editor";
import type { ProviderRosterEntry } from "@/ui/api-key-settings/types";
import type { ApiKeySubmissionState } from "@/ui/atoms/multi-state-submission-badge";
import type { User } from "@/utils/auth-client";
import type { SubmitEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteApiKey,
  getDecryptedApiKeyOnEdit,
  upsertApiKey
} from "@/app/actions/api-key";
import { useApiKeys } from "@/context/api-keys-context";
import { cn } from "@/lib/utils";
import {
  API_KEY_SETTINGS_TEXT_CONSTS,
  providerRoster
} from "@/ui/api-key-settings/constants";
import {
  DELETE_CONFIRMATION,
  deriveRows,
  describeFailure,
  isDeleteConfirmation
} from "@/ui/api-key-settings/derive";
import { ApiKeyEditor } from "@/ui/api-key-settings/editor";
import { AnimatePresence, motion } from "motion/react";
import type { Provider } from "@slipstream/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  BreakoutWrapper,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SquarePen,
  Trash
} from "@slipstream/ui";

/**
 * a write we've completed against the action and are now waiting to see
 * reflected by the server (`provider_context_update_ack`). `ackSeq` is the
 * context's counter at send time; the ack has landed once it advances.
 */
interface PendingWrite {
  readonly provider: Provider;
  readonly kind: "save" | "delete";
  readonly ackSeq: number;
}

interface RowNotice {
  readonly provider: Provider;
  readonly text: string;
}

interface ApiKeysTabProps {
  className?: string;
  user?: User;
}

const { CARD_HEADER_TEXT, CARD_FOOTER_TEXT } = API_KEY_SETTINGS_TEXT_CONSTS;

/** how long the "Saved" flourish lingers on a row — cosmetic only, owns no state */
const SAVED_FLOURISH_MS = 2000;

function rosterEntry(provider: Provider) {
  return providerRoster.find(entry => entry.provider === provider);
}

function textOf(provider: Provider) {
  return rosterEntry(provider)?.text ?? provider;
}

const Spinner = () => (
  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
);

/**
 * BYOK settings. Server truth (`providerContext`) is rendered directly; the
 * only local state is ONE editor's draft plus what's in flight. Saves close
 * on the server's ack — never on a timer.
 */
export function ApiKeysTab({ className = "", user: _user }: ApiKeysTabProps) {
  const {
    providerContext,
    sendProviderContextUpdate,
    updateAckSeq,
    subscribeUpdateAck
  } = useApiKeys();

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPendingState] = useState<PendingWrite | null>(null);
  const [revealing, setRevealing] = useState<Provider | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Provider | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [rowNotice, setRowNotice] = useState<RowNotice | null>(null);
  const [justSaved, setJustSaved] = useState<Provider | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const confirmInputRef = useRef<HTMLInputElement | null>(null);
  // ref twin of `pending` so the ack listener (an external-event callback) reads the live value
  const pendingRef = useRef<PendingWrite | null>(null);
  const setPending = useCallback((next: PendingWrite | null) => {
    pendingRef.current = next;
    setPendingState(next);
  }, []);

  const busy = submitting || pending !== null;

  // our in-flight write's ack landed → the row re-derives from providerContext; close up
  useEffect(
    () =>
      subscribeUpdateAck(seq => {
        const current = pendingRef.current;
        if (!current || seq <= current.ackSeq) return;
        setPending(null);
        if (current.kind === "save") {
          setEditor(null);
          setJustSaved(current.provider);
        }
      }),
    [subscribeUpdateAck, setPending]
  );

  // cosmetic: let the "Saved" flourish fade
  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(null), SAVED_FLOURISH_MS);
    return () => clearTimeout(timer);
  }, [justSaved]);

  // focus the field whenever an editor opens
  const editorProvider = editor?.provider ?? null;
  useEffect(() => {
    if (editorProvider) inputRef.current?.focus();
  }, [editorProvider]);

  const openAdd = useCallback(
    (provider: Provider) => {
      if (busy) return;
      setRowNotice(null);
      setEditor({
        provider,
        mode: "add",
        value: "",
        original: "",
        isDefault: false,
        originalDefault: false,
        masked: false,
        error: null
      });
    },
    [busy]
  );

  const openEdit = useCallback(
    async (provider: Provider, currentDefault: boolean) => {
      if (busy || revealing) return;
      setRowNotice(null);
      setRevealing(provider);
      const result = await getDecryptedApiKeyOnEdit(provider);
      setRevealing(null);
      if (!result.success) {
        setRowNotice({
          provider,
          text: describeFailure(result.payload, textOf(provider))
        });
        return;
      }
      setEditor({
        provider,
        mode: "edit",
        value: result.payload,
        original: result.payload,
        isDefault: currentDefault,
        originalDefault: currentDefault,
        masked: true,
        error: null
      });
    },
    [busy, revealing]
  );

  const cancelEditing = useCallback(() => {
    if (submitting) return;
    setEditor(null);
  }, [submitting]);

  const updateValue = useCallback((value: string) => {
    setEditor(prev => (prev ? { ...prev, value, error: null } : prev));
  }, []);

  const updateDefault = useCallback((isDefault: boolean) => {
    setEditor(prev => (prev ? { ...prev, isDefault, error: null } : prev));
  }, []);

  const toggleMask = useCallback(() => {
    setEditor(prev => (prev ? { ...prev, masked: !prev.masked } : prev));
  }, []);

  const handleSubmit = useCallback(
    async (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editor || busy) return;
      const { provider, isDefault } = editor;
      const apiKey = editor.value.trim();
      if (apiKey.length === 0) return;

      setSubmitting(true);
      const formData = new FormData();
      formData.set("provider", provider);
      formData.set("apiKey", apiKey);
      formData.set("asDefault", String(isDefault));

      const result = await upsertApiKey(formData);
      setSubmitting(false);
      if (!result.success) {
        const error = describeFailure(result.payload, textOf(provider));
        setEditor(prev =>
          prev?.provider === provider ? { ...prev, error } : prev
        );
        return;
      }
      // persisted — now wait for the server to re-read and ack with fresh providerContext
      setPending({ provider, kind: "save", ackSeq: updateAckSeq });
      sendProviderContextUpdate(true);
    },
    [editor, busy, updateAckSeq, sendProviderContextUpdate, setPending]
  );

  const openDeleteConfirm = useCallback((provider: Provider) => {
    setDeleteConfirmText("");
    setConfirmDelete(provider);
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    setConfirmDelete(null);
    setDeleteConfirmText("");
  }, []);

  const deleteArmed = isDeleteConfirmation(deleteConfirmText);

  const confirmDeleteNow = useCallback(
    async (provider: Provider) => {
      if (!deleteArmed) return;
      closeDeleteConfirm();
      if (busy) return;
      setRowNotice(null);
      if (editor?.provider === provider) setEditor(null);
      setPending({ provider, kind: "delete", ackSeq: updateAckSeq });

      const formData = new FormData();
      formData.set("provider", provider);
      formData.set("confirm", DELETE_CONFIRMATION);
      const result = await deleteApiKey(formData);
      if (!result.success) {
        setPending(null);
        setRowNotice({
          provider,
          text: describeFailure(result.payload, textOf(provider))
        });
        return;
      }
      sendProviderContextUpdate(true);
    },
    [
      deleteArmed,
      closeDeleteConfirm,
      busy,
      editor,
      updateAckSeq,
      sendProviderContextUpdate,
      setPending
    ]
  );

  const editorBadgeState: ApiKeySubmissionState = !editor
    ? "idle"
    : editor.error
      ? "error"
      : submitting || pending?.provider === editor.provider
        ? "processing"
        : "idle";

  const canSave =
    editor !== null &&
    !busy &&
    editor.value.trim().length > 0 &&
    (editor.mode === "add" ||
      editor.value !== editor.original ||
      editor.isDefault !== editor.originalDefault);

  const renderEditor = (entry: ProviderRosterEntry) =>
    editor?.provider === entry.provider ? (
      <ApiKeyEditor
        entry={entry}
        editor={editor}
        badgeState={editorBadgeState}
        busy={busy}
        canSave={canSave}
        inputRef={inputRef}
        onValueChange={updateValue}
        onDefaultChange={updateDefault}
        onToggleMask={toggleMask}
        onCancel={cancelEditing}
        onSubmit={e => void handleSubmit(e)}
      />
    ) : null;

  const rows = providerContext
    ? deriveRows(providerContext, providerRoster)
    : null;
  const addEntry =
    editor?.mode === "add" ? (rosterEntry(editor.provider) ?? null) : null;
  const gridEntries =
    rows?.available.filter(entry => entry.provider !== addEntry?.provider) ??
    [];
  const allConfigured =
    rows !== null &&
    rows.configured.length === providerRoster.length &&
    editor === null;

  return (
    <BreakoutWrapper>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={cn("w-full", className)}>
        <Card className="bg-background/40 border-foreground/25 text-foreground/90 font-basis mx-auto w-full max-w-full overflow-hidden backdrop-blur-xs sm:mx-0">
          <CardHeader className="">
            <CardTitle className="text-foreground/95 text-xl">BYOK</CardTitle>
            <CardDescription className="text-foreground-muted text-xs tracking-tight sm:text-base">
              {CARD_HEADER_TEXT}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {rows === null && (
              <div className="text-brand-text-muted flex items-center space-x-2 text-sm">
                <Spinner />
                <span>Loading your keys…</span>
              </div>
            )}

            {/* Configured providers — derived from providerContext.isSet */}
            {rows && rows.configured.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-brand-text-muted sr-only text-sm font-medium">
                  Configured Providers
                </h3>
                <AnimatePresence mode="popLayout">
                  {rows.configured.map(row => {
                    const isEditing = editor?.provider === row.provider;
                    const isRevealing = revealing === row.provider;
                    const isDeleting =
                      pending?.kind === "delete" &&
                      pending.provider === row.provider;
                    const status =
                      justSaved === row.provider
                        ? "✓ Saved"
                        : row.isDefault
                          ? "✓ Default provider"
                          : "Key on file";
                    return (
                      <motion.div
                        key={row.provider}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="relative flex items-center space-x-2">
                            <row.icon className="size-4 shrink-0" />
                            <span className="text-foreground text-sm font-medium">
                              {row.text}
                            </span>
                            <div className="motion-safe:animate-twinkle size-1.5 shrink-0 rounded-full bg-green-600" />
                            {row.isDefault && (
                              <span className="bg-foreground/20 text-foreground/80 text-xxs sr-only shrink-0 rounded-2xl bg-clip-border px-1 py-0.5">
                                default
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                void openEdit(row.provider, row.isDefault)
                              }
                              disabled={isRevealing || isDeleting || busy}
                              aria-label={`Edit ${row.text} API key`}
                              className="hover:bg-brand-primary/20 h-8 w-8 p-0">
                              {isRevealing ? (
                                <Spinner />
                              ) : (
                                <SquarePen className="h-4 w-4" />
                              )}
                            </Button>

                            <AlertDialog
                              open={confirmDelete === row.provider}
                              onOpenChange={open => {
                                if (!open) closeDeleteConfirm();
                              }}>
                              <AlertDialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openDeleteConfirm(row.provider)}
                                  disabled={isDeleting || busy}
                                  aria-label={`Delete ${row.text} API key`}
                                  className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/20">
                                  {isDeleting ? (
                                    <Spinner />
                                  ) : (
                                    <Trash className="h-4 w-4" />
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent
                                className="bg-brand-component border-brand-border mx-4 sm:mx-0"
                                onOpenAutoFocus={e => {
                                  e.preventDefault();
                                  confirmInputRef.current?.focus();
                                }}>
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-brand-text-emphasis">
                                    Delete API Key
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-brand-text-muted">
                                    This removes your {row.text} API key. It
                                    cannot be undone — you'll need to re-enter a
                                    key to use this provider again. Type{" "}
                                    <span className="text-brand-text-emphasis font-mono font-semibold">
                                      {DELETE_CONFIRMATION}
                                    </span>{" "}
                                    to confirm.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="space-y-2">
                                  <Label
                                    htmlFor={`confirm-delete-${row.provider}`}
                                    className="text-brand-text-muted sr-only text-sm">
                                    Type {DELETE_CONFIRMATION} to confirm
                                  </Label>
                                  <Input
                                    ref={confirmInputRef}
                                    id={`confirm-delete-${row.provider}`}
                                    type="text"
                                    inputMode="text"
                                    autoComplete="off"
                                    autoCapitalize="characters"
                                    spellCheck={false}
                                    placeholder={DELETE_CONFIRMATION}
                                    value={deleteConfirmText}
                                    onChange={e =>
                                      setDeleteConfirmText(e.target.value)
                                    }
                                    onKeyDown={e => {
                                      if (e.key === "Enter" && deleteArmed) {
                                        e.preventDefault();
                                        void confirmDeleteNow(row.provider);
                                      }
                                    }}
                                    className="bg-brand-background border-brand-border focus:ring-brand-ring text-brand-text font-mono"
                                  />
                                </div>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    disabled={!deleteArmed}
                                    onClick={() =>
                                      void confirmDeleteNow(row.provider)
                                    }
                                    className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                                    Delete Key
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>

                        {!isEditing && (
                          <div className="flex items-center space-x-2 pl-7">
                            <div className="text-brand-text-muted text-sm">
                              {status}
                            </div>
                          </div>
                        )}

                        {rowNotice?.provider === row.provider && (
                          <div
                            role="alert"
                            className="pl-7 text-sm text-red-500">
                            {rowNotice.text}
                          </div>
                        )}

                        {renderEditor(row)}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

            {/* Divider — only when both sections render */}
            {rows &&
              rows.configured.length > 0 &&
              (addEntry !== null || gridEntries.length > 0) && (
                <div className="flex items-center space-x-4 py-2">
                  <div className="border-brand-border flex-1 border-t border-dotted"></div>
                </div>
              )}

            {/* Add a provider — the one open add-editor (if any) above the grid of the rest */}
            {rows && (addEntry !== null || gridEntries.length > 0) && (
              <div className="space-y-4">
                <div className="text-brand-text-muted text-sm font-medium">
                  Add a provider
                </div>

                {addEntry && (
                  <motion.div
                    key={addEntry.provider}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <addEntry.icon className="h-5 w-5 shrink-0" />
                      <label
                        htmlFor={`${addEntry.provider}-key`}
                        className="text-brand-text-muted text-sm font-medium">
                        {addEntry.text}
                      </label>
                    </div>
                    {renderEditor(addEntry)}
                  </motion.div>
                )}

                {gridEntries.length > 0 && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
                    {gridEntries.map(entry => (
                      <Button
                        key={entry.provider}
                        type="button"
                        variant="outline"
                        onClick={() => openAdd(entry.provider)}
                        disabled={busy}
                        className="bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text h-auto min-h-14 justify-start space-x-1.5">
                        <entry.icon className="h-6 w-6 shrink-0" />
                        <span className="text-left text-sm">{entry.text}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {allConfigured && (
              <div className="py-8 text-center">
                <div className="text-brand-text-muted text-sm">
                  🎉 All supported providers have been configured!
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="text-brand-text-muted text-xs tracking-tight">
            {CARD_FOOTER_TEXT}
          </CardFooter>
        </Card>
      </motion.div>
    </BreakoutWrapper>
  );
}
