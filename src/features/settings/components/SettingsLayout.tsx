import { Screen } from '@/src/components/layout';
import { Inset, Stack } from '@/src/design-system';
import { SettingsFooter } from '@/src/features/settings/components/SettingsFooter';
import React from 'react';

interface SettingsLayoutProps {
  title: string;
  showBack?: boolean;
  scrollable?: boolean;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

/**
 * SettingsLayout - A shared layout for all settings screens to ensure consistent
 * spacing, padding, and footer placement.
 */
export function SettingsLayout({
  title,
  showBack = true,
  scrollable = true,
  children,
  headerActions,
  edges,
}: SettingsLayoutProps) {
  return (
    <Screen
      title={title}
      showBack={showBack}
      scrollable={scrollable}
      headerActions={headerActions}
      edges={edges}
    >
      <Inset space="md" vertical="md" flex={scrollable ? undefined : 1}>
        <Stack space="xl" flex={scrollable ? undefined : 1}>
          {children}
          <SettingsFooter />
        </Stack>
      </Inset>
    </Screen>
  );
}
