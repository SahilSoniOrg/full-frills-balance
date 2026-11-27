import type { FloatingActionButtonProps } from '@/src/components/core/FloatingActionButton';
import { Icon } from '@/src/types/domainIcons';
import type { ReactNode } from 'react';
import type { SelectionOverlayProps } from '@/src/components/shared/SelectionOverlay';

export type NavBackIcon = typeof Icon.Back | typeof Icon.Close;

export type ScreenFabChrome = Pick<
  FloatingActionButtonProps,
  'onPress' | 'label' | 'icon' | 'placement' | 'accessibilityLabel' | 'testID'
>;

type ScreenChromeBase = {
  isSearchActive?: boolean;
  /** Present while the screen is in selection mode, even if no items are selected. */
  selection?: SelectionOverlayProps;
};

/**
 * Screen-owned chrome contract (#29).
 *
 * - **Screen** builds and passes `chrome` (`withPrivacyScope` on money routes).
 * - **View** renders via `ScreenWithChrome` — no chrome props other than `chrome`.
 * - Selection replaces the header and suspends the screen FAB.
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

/** Detail / nav screens: back is always shown; title and onBack are required. */
export type ScreenNavChrome = ScreenChromeBase & {
  kind: 'nav';
  fab?: ScreenFabChrome;
  screenTitle: string;
  /** Defaults from the route's presentation; override only for in-screen steps. */
  backIcon?: NavBackIcon;
  onBack: () => void;
  headerActions?: ReactNode;
};

export type ScreenChrome = TabScreenChrome | PlainScreenChrome | ScreenNavChrome;
