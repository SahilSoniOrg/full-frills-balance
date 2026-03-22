import { AppCard, AppText } from '@/src/components/core';
import { Box, Separator, Stack } from '@/src/design-system';
import React, { Children, Fragment } from 'react';

type SettingsMenuProps = {
    children: React.ReactNode;
    header?: string;
    footer?: string;
    hideSeprator?: boolean;
};

/**
 * SettingsMenu - A container for settings items inspired by rainbowLink
 * Provides a card background and automatic separators between children.
 */
export function SettingsMenu({ children, header, footer, hideSeprator }: SettingsMenuProps) {
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
            <AppCard padding="none" style={{ overflow: 'hidden' }}>
                <Stack space={0}>
                    {childrenArray.map((child, index) => (
                        <Fragment key={index}>
                            {child}
                            {!hideSeprator && index < childrenArray.length - 1 && <Separator marginHorizontal="md" />}
                        </Fragment>
                    ))}
                </Stack>
            </AppCard>
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
