import type { IconName } from '@/src/components/core';
import type { AccountType } from '@/src/types/enums';

export type AppearancePickerMode = 'both' | 'icon' | 'color';

export type AppearancePickerRequest = {
  mode?: AppearancePickerMode;
  title?: string;
  selectedIcon?: IconName;
  selectedColor?: string;
  accountType?: AccountType;
  /** Override the account-type accent for other entities such as people. */
  defaultAccentColor?: string;
  previewLabel?: string;
  defaultColorLabel?: string;
  /** Live updates while the sheet is open (e.g. form preview behind the sheet). */
  onIconSelect?: (icon: IconName) => void;
  onColorSelect?: (color: string) => void;
};

export type AppearancePickerResult = {
  icon: IconName;
  color: string;
};

type PendingAppearancePicker = AppearancePickerRequest & {
  resolve: (result: AppearancePickerResult | null) => void;
};

type Listener = () => void;

let pending: PendingAppearancePicker | null = null;
/** Stable snapshot for useSyncExternalStore — same reference until open/close. */
let snapshot: AppearancePickerRequest | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setPending(next: PendingAppearancePicker | null): void {
  pending = next;
  if (!next) {
    snapshot = null;
  } else {
    const { resolve: _resolve, ...request } = next;
    snapshot = request;
  }
  emit();
}

/** Subscribe to open/close of the appearance picker sheet (for the root host). */
export function subscribeAppearancePicker(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Opens the appearance bottom sheet and resolves when the user saves or dismisses. */
export function openAppearancePicker(
  request: AppearancePickerRequest = {},
): Promise<AppearancePickerResult | null> {
  if (pending) {
    pending.resolve(null);
  }
  return new Promise(resolve => {
    setPending({ ...request, resolve });
  });
}

export function peekAppearancePickerRequest(): AppearancePickerRequest | null {
  return snapshot;
}

export function finishAppearancePicker(result: AppearancePickerResult | null): void {
  const current = pending;
  if (!current) return;
  setPending(null);
  current.resolve(result);
}

/** Test helper — clears any unfinished session without navigating. */
export function resetAppearancePickerSessionForTests(): void {
  if (pending) {
    const current = pending;
    setPending(null);
    current.resolve(null);
  } else if (snapshot) {
    setPending(null);
  }
}
