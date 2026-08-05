import type { IconName } from '@/src/components/core';
import type { Screen } from '@/src/components/layout/Screen';
import type { ReactNode } from 'react';

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
  alignTitle?: React.ComponentProps<typeof Screen>['alignTitle'];
};

/**
 * Screen-owned chrome contract (#29).
 *
 * - **Screen** builds and passes `chrome` (`withPrivacyScope` on money routes).
 * - **View** renders via `ScreenWithChrome` — no `PrivacyToggleButton` imports.
 * - Header actions live in Screen (or feature `*HeaderActions` built by Screen).
 */
export type TabScreenChrome = ScreenChromeShared & {
  screenTitle: string;
  headerActions: ReactNode;
  showBack?: boolean;
  backIcon?: React.ComponentProps<typeof Screen>['backIcon'];
};

/** Detail / nav screens: back is always shown; title and back icon are required. */
export type ScreenNavChrome = ScreenChromeShared & {
  screenTitle: string;
  showBack: true;
  backIcon: NonNullable<TabScreenChrome['backIcon']>;
  headerActions?: ReactNode;
};

export type ScreenChrome = TabScreenChrome | ScreenNavChrome;
