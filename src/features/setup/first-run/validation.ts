export const MAX_ONBOARDING_ITEM_NAME_LENGTH = 60;

/** Commit names on blur/submit, preserving the typed value until that point. */
export function committedItemName(value: string, fallback: string): string {
  return value.trim().slice(0, MAX_ONBOARDING_ITEM_NAME_LENGTH).trimEnd() || fallback;
}
