import { AppCard, AppText } from '@/src/components/core';
import { Opacity, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { Stack } from '@/src/design-system';

type SettingsSectionProps = {
    title: string;
    danger?: boolean;
    children: React.ReactNode;
};

export function SettingsSection({ title, danger = false, children }: SettingsSectionProps) {
    const { theme, fonts } = useTheme();

    return (
        <Stack space="sm" marginTop="md">
            <AppText
                variant="subheading"
                style={{
                    fontFamily: fonts.bold,
                    color: danger ? theme.error : theme.text,
                }}
            >
                {title}
            </AppText>
            <AppCard
                elevation="sm"
                padding="md"
                style={danger ? { borderColor: withOpacity(theme.error, Opacity.soft), borderWidth: 1 } : undefined}
            >
                <Stack space="md">{children}</Stack>
            </AppCard>
        </Stack>
    );
}

