import type { ScreenChrome, ScreenFabChrome } from '@/src/components/layout/screenChrome';
import { Opacity } from '@/src/constants';

type SelectionChromeOpts = {
  active: boolean;
  /** When selecting, back exits selection instead of navigating. */
  onExit?: () => void;
  /** FAB when idle; cleared while selecting. */
  fab?: ScreenFabChrome;
};

/** Dim nav + mute FAB (+ optional back→exit) while multi-select is active. */
export function applySelectionChrome<T extends ScreenChrome>(
  chrome: T,
  { active, onExit, fab }: SelectionChromeOpts,
): T {
  if (!active) {
    return fab ? { ...chrome, fab } : chrome;
  }

  return {
    ...chrome,
    fab: undefined,
    headerStyle: { opacity: Opacity.medium },
    onBack: onExit ?? chrome.onBack,
  };
}
