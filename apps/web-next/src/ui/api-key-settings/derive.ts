import type { ClientContextWorkupProps, Provider } from "@slipstream/types";

/** the minimum a roster entry needs for derivation — keeps this module free of icons/React */
export interface RosterEntryLike {
  readonly provider: Provider;
}

/**
 * Split the immutable roster against server truth. `configured` carries `isDefault`
 * from `providerContext`; both lists preserve roster order. Pure — the component
 * renders exactly this, nothing is mirrored into state.
 */
export function deriveRows<const T extends RosterEntryLike>(
  ctx: ClientContextWorkupProps,
  roster: readonly T[]
) {
  const configured = Array.of<T & { readonly isDefault: boolean }>();
  const available = Array.of<T>();
  for (const entry of roster) {
    if (ctx.isSet[entry.provider]) {
      configured.push({ ...entry, isDefault: ctx.isDefault[entry.provider] });
    } else {
      available.push(entry);
    }
  }
  return { configured, available } as const;
}

/** the phrase a user must type to arm the delete button — also sent as `confirm` in the delete FormData */
export const DELETE_CONFIRMATION = "DELETE";

/** exact, case-sensitive match after trimming — misclick protection, not security */
export function isDeleteConfirmation(text: string) {
  return text.trim() === DELETE_CONFIRMATION;
}

const VALIDATOR_PREFIX = "validator message: ";
const NO_KEY_PREFIX = "No API key configured for ";
const DECRYPT_PREFIX = "Failed to Decrypt API key for ";

/**
 * Map an action failure `payload` (the literal strings `upsertApiKey` /
 * `deleteApiKey` / `getDecryptedApiKeyOnEdit` return) to user-facing copy.
 * The validator breadcrumb is `invalid_api_key__<provider>__<status>[__extra]`.
 */
export function describeFailure(payload: string, providerText: string) {
  if (payload === "unauthorized") {
    return "You're signed out — sign in again to manage API keys.";
  }
  if (payload === "input api key is not of type string") {
    return "Enter an API key first.";
  }
  if (payload.startsWith(VALIDATOR_PREFIX)) {
    const status = payload.slice(VALIDATOR_PREFIX.length).split("__")[2];
    return status && /^\d{3}$/.test(status)
      ? `${providerText} rejected this key (HTTP ${status}).`
      : `${providerText} rejected this key.`;
  }
  if (payload.startsWith(NO_KEY_PREFIX)) {
    return `No key on file for ${providerText}.`;
  }
  if (payload.startsWith(DECRYPT_PREFIX)) {
    return `Couldn't decrypt the stored ${providerText} key — re-enter it to replace it.`;
  }
  return "Couldn't save this key. Please try again.";
}
