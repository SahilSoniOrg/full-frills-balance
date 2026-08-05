import { ScreenWithChrome } from '@/src/components/layout/ScreenWithChrome';
import type { ScreenChrome } from '@/src/components/layout/screenChrome';
import { Inset, Stack } from '@/src/design-system';
import { SettingsFooter } from '@/src/features/settings/components/SettingsFooter';
import React from 'react';
import type { Edge } from 'react-native-safe-area-context';

interface SettingsLayoutProps {
  chrome: ScreenChrome;
  scrollable?: boolean;
  children: React.ReactNode;
  edges?: Edge[];
  hideFooter?: boolean;
}

/**
 * Settings shell: Screen-owned chrome + consistent inset/footer.
 */
export function SettingsLayout({
  chrome,
  scrollable = true,
  children,
  edges,
  hideFooter = false,
}: SettingsLayoutProps) {
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
