import type {
  FloatingActionButtonBehavior,
  FloatingActionButtonProps,
} from '@/src/components/core/FloatingActionButton';
import { Icon } from '@/src/types/domainIcons';
import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

export type NavBackIcon = typeof Icon.Back | typeof Icon.Close;

export type ScreenFabChrome = FloatingActionButtonBehavior &
  Pick<FloatingActionButtonProps, 'label' | 'icon' | 'placement' | 'accessibilityLabel'>;

type ScreenChromeBase = {
  isSearchActive?: boolean;
  /** Drives the persistent tab navigation gate for drawer access during selection. */
  selectionMode?: boolean;
  /** Dim / style nav (e.g. selection mode). Owned by Screen. */
  headerStyle?: ViewStyle;
};

/**
 * Screen-owned chrome contract (#29).
 *
 * - **Screen** builds and passes `chrome` (`withPrivacyScope` on money routes).
 * - **View** renders via `ScreenWithChrome` — no chrome props other than `chrome`.
 * - Left slot / headerStyle live on `chrome`; FAB only on `ScreenNavChrome` (see `applySelectionChrome`).
 *
 * Left header slot (chosen in `ScreenWithChrome`):
 * - `kind: 'nav'` → back
 * - `kind: 'tab'` under PrimaryNavigationProvider → drawer trigger
 * - `kind: 'plain'` / tab without provider → no left control
 */

/** Primary tab roots. FAB is forbidden here — creation is the tab-bar Add control. */
export type TabScreenChrome = ScreenChromeBase & {
  kind: 'tab';
  screenTitle: string;
  headerActions?: ReactNode;
};

/** Full-screen shell with no back control and no drawer trigger (e.g. required privacy). */
export type PlainScreenChrome = ScreenChromeBase & {
  kind: 'plain';
  screenTitle: string;
  headerActions?: ReactNode;
};

/** Detail / nav screens: back is always shown; title, back icon, and onBack are required. */
export type ScreenNavChrome = ScreenChromeBase & {
  kind: 'nav';
  fab?: ScreenFabChrome;
  screenTitle: string;
  backIcon: NavBackIcon;
  onBack: () => void;
  headerActions?: ReactNode;
};

export type ScreenChrome = TabScreenChrome | PlainScreenChrome | ScreenNavChrome;
