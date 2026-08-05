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
  /** Override back (e.g. exit selection). Owned by Screen. */
  onBack?: () => void;
};

/**
 * Screen-owned chrome contract (#29).
 *
 * - **Screen** builds and passes `chrome` (`withPrivacyScope` on money routes).
 * - **View** renders via `ScreenWithChrome` — no `PrivacyToggleButton` imports.
 * - Header actions live in Screen (or feature `*HeaderActions` built by Screen).
 * - Privacy eye is always the trailing (rightmost) header action when present.
 *
 * Title alignment is derived in NavigationBar (not set here):
 * - `showBack: true` → centered (stack / pushed)
 * - no back → left (tab roots)
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
