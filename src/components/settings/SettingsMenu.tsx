import { AppText } from '@/src/components/core';
import { AppCard } from '@/src/components/core/AppCard';
import { SettingsFocusTarget } from '@/src/components/settings/SettingsFocusTarget';
import { SETTINGS_SEPARATOR_INSET } from '@/src/components/settings/settingsTokens';
import { Box, Separator, Stack } from '@/src/design-system';
import React, { Children, Fragment } from 'react';

export type SettingsMenuProps = {
  children: React.ReactNode;
  header?: string;
  /** Optional section-level focus target for search navigation. */
  focusId?: string;
  /** Surface is the legacy shared default; feature settings opt into flat explicitly. */
  variant?: 'flat' | 'surface';
};

export function SettingsMenu({
  children,
  header,
  focusId,
  variant = 'surface',
}: SettingsMenuProps) {
  const childrenArray = Children.toArray(children).filter(Boolean);
  const content = (
    <Stack space={0}>
      {childrenArray.map((child, index) => (
        <Fragment key={index}>
          {child}
          {index < childrenArray.length - 1 && (
            <Separator marginLeft={SETTINGS_SEPARATOR_INSET} background="border" />
          )}
        </Fragment>
      ))}
    </Stack>
  );

  const section = (
    <Stack space="sm">
      {header && (
        <Box paddingHorizontal="md" marginBottom="xs">
          <AppText variant="overline" color="secondary">
            {header}
          </AppText>
        </Box>
      )}
      {variant === 'surface' ? (
        <AppCard paddingSize="none" radius="r2" elevation="none">
          {content}
        </AppCard>
      ) : (
        content
      )}
    </Stack>
  );

  return focusId ? (
    <SettingsFocusTarget targetId={focusId}>{section}</SettingsFocusTarget>
  ) : (
    section
  );
}
