import { ScreenWithChrome } from '@/src/components/layout/ScreenWithChrome';
import type {
  NavBackIcon,
  ScreenChrome,
  ScreenFabChrome,
} from '@/src/components/layout/screenChrome';
import { Inset, Stack } from '@/src/design-system';
import { SettingsFooter } from '@/src/features/settings/components/SettingsFooter';
import React from 'react';
import type { Edge } from 'react-native-safe-area-context';

interface SettingsLayoutProps {
  title: string;
  headerActions?: React.ReactNode;
  fab?: ScreenFabChrome;
  /** Tab root: false. Sub-screens: true (default). */
  showBack?: boolean;
  backIcon?: NavBackIcon;
  scrollable?: boolean;
  children: React.ReactNode;
  edges?: Edge[];
  hideFooter?: boolean;
}

/**
 * Settings shell: builds default nav chrome from title + optional actions/FAB.
 */
export function SettingsLayout({
  title,
  headerActions,
  fab,
  showBack = true,
  backIcon = 'back',
  scrollable = true,
  children,
  edges,
  hideFooter = false,
}: SettingsLayoutProps) {
  const chrome: ScreenChrome = showBack
    ? { screenTitle: title, showBack: true, backIcon, headerActions, fab }
    : { screenTitle: title, showBack: false, headerActions, fab };

  return (
    <ScreenWithChrome chrome={chrome} scrollable={scrollable} edges={edges}>
      <Inset space="md" vertical="md" flex={scrollable ? undefined : 1}>
        <Stack space="xl" flex={scrollable ? undefined : 1}>
          {children}
          {!hideFooter && <SettingsFooter />}
        </Stack>
      </Inset>
    </ScreenWithChrome>
  );
}
