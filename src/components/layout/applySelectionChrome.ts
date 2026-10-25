import type {
  ScreenChrome,
  ScreenFabChrome,
  ScreenNavChrome,
  TabScreenChrome,
} from '@/src/components/layout/screenChrome';
import { Opacity } from '@/src/constants';

type SelectionChromeOpts = {
  active: boolean;
  /** When selecting, back exits selection instead of navigating. */
  onExit?: () => void;
};

/** Dim nav while multi-select is active on a primary tab. */
export function applySelectionChrome(
  chrome: TabScreenChrome,
  opts: SelectionChromeOpts,
): TabScreenChrome;
/** Dim nav, mute FAB (+ optional back→exit) while multi-select is active on a pushed screen. */
export function applySelectionChrome(
  chrome: ScreenNavChrome,
  opts: SelectionChromeOpts & { fab?: ScreenFabChrome },
): ScreenNavChrome;
export function applySelectionChrome<T extends ScreenChrome>(
  chrome: T,
  { active, onExit, fab }: SelectionChromeOpts & { fab?: ScreenFabChrome },
): T {
  if (!active) {
    if (chrome.kind === 'nav' && fab) {
      return { ...chrome, fab, selectionMode: false };
    }
    return { ...chrome, selectionMode: false };
  }

  if (chrome.kind === 'nav') {
    return {
      ...chrome,
      fab: undefined,
      selectionMode: true,
      headerStyle: { opacity: Opacity.medium },
      onBack: onExit ?? chrome.onBack,
    };
  }

  return {
    ...chrome,
    selectionMode: true,
    headerStyle: { opacity: Opacity.medium },
  };
}
