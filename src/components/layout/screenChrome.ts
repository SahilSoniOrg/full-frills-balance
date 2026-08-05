import type { IconName } from '@/src/components/core';
import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

export type NavBackIcon = 'back' | 'close';

export type ScreenFabChrome = {
  onPress: () => void;
  label?: string;
  icon?: IconName;
  placement?: 'end' | 'center';
  accessibilityLabel?: string;
};

type ScreenChromeShared = {
  fab?: ScreenFabChrome;
  isSearchActive?: boolean;
  /** Dim / style nav (e.g. selection mode). Owned by Screen. */
  headerStyle?: ViewStyle;
  /** Override back (e.g. exit selection). Owned by Screen — not a ScreenWithChrome prop. */
  onBack?: () => void;
};

/**
 * Screen-owned chrome contract (#29).
 *
 * - **Screen** builds and passes `chrome` (`withPrivacyScope` on money routes).
 * - **View** renders via `ScreenWithChrome` — no chrome props other than `chrome`.
 * - Back / headerStyle / FAB live only on `chrome` (see `applySelectionChrome` for Selection mode nav patch).
 * - Selection-mode secondary chrome (action bar + dismiss) lives on `TransactionListView`.
 * - Privacy eye is always the trailing (rightmost) header action when present.
 *
 * Header actions:
 * - Simple icon rows → `ScreenHeaderActions` (+ `MoneyDetailHeaderActions` for privacy).
 * - Badges, inline search, text buttons → feature `*HeaderActions` (still trailing privacy).
 *
 * Title alignment is derived in NavigationBar (not set here):
 * - `showBack: true` → centered (stack / pushed)
 * - no back → left (tab roots)
 *
 * Settings exception: `SettingsLayout` builds chrome from `title` (shell).
 */
export type TabScreenChrome = ScreenChromeShared & {
  screenTitle: string;
  headerActions?: ReactNode;
  showBack?: boolean;
  backIcon?: NavBackIcon;
};

/** Detail / nav screens: back is always shown; title and back icon are required. */
export type ScreenNavChrome = ScreenChromeShared & {
  screenTitle: string;
  showBack: true;
  backIcon: NavBackIcon;
  headerActions?: ReactNode;
};

export type ScreenChrome = TabScreenChrome | ScreenNavChrome;
