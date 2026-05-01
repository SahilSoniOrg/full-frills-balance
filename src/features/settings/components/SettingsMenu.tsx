import { AppText } from '@/src/components/core';
import { AppSurface } from '@/src/components/core/AppSurface';
import { Box, Separator, Stack } from '@/src/design-system';
import React, { Children, Fragment } from 'react';

type SettingsMenuProps = {
  children: React.ReactNode;
  header?: string;
  footer?: string;
  hideSeparator?: boolean;
};

/**
 * SettingsMenu - A container for settings items inspired by rainbowLink
 * Provides a card background and automatic separators between children.
 */
export function SettingsMenu({ children, header, footer, hideSeparator }: SettingsMenuProps) {
  const childrenArray = Children.toArray(children).filter(Boolean);

  return (
    <Stack space="sm">
      {header && (
        <Box paddingHorizontal="md" marginBottom="xs">
          <AppText
            variant="caption"
            color="secondary"
            weight="bold"
            style={{ letterSpacing: 1, textTransform: 'uppercase' }}
          >
            {header}
          </AppText>
        </Box>
      )}
      <AppSurface radius="r2" elevation="none" style={{ overflow: 'hidden' }}>
        <Stack space={0}>
          {childrenArray.map((child, index) => (
            <Fragment key={index}>
              {child}
              {!hideSeparator && index < childrenArray.length - 1 && (
                <Separator marginLeft={58} background="border" />
              )}
            </Fragment>
          ))}
        </Stack>
      </AppSurface>
      {footer && (
        <Box paddingHorizontal="md" marginTop="xs">
          <AppText variant="caption" color="secondary">
            {footer}
          </AppText>
        </Box>
      )}
    </Stack>
  );
}
