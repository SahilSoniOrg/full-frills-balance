import { AppCard, AppText } from '@/src/components/core';
import { Opacity, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

type SettingsSectionProps = {
    title: string;
    danger?: boolean;
    children: React.ReactNode;
};

export function SettingsSection({ title, danger = false, children }: SettingsSectionProps) {
    const { theme, fonts } = useTheme();

    return (
        <>
            <AppText
                variant="subheading"
                style={[
                    styles.sectionTitle,
                    {
                        fontFamily: fonts.bold,
                        color: danger ? theme.error : theme.text,
                    },
                ]}
            >
                {title}
            </AppText>
            <AppCard
                elevation="sm"
                padding="md"
                style={[
                    styles.card,
                    danger && {
                        borderColor: withOpacity(theme.error, Opacity.soft),
                        borderWidth: 1,
                    },
                ]}
            >
                <View>{children}</View>
            </AppCard>
        </>
    );
}

const styles = StyleSheet.create({
    sectionTitle: {
        marginBottom: Spacing.sm,
        marginTop: Spacing.md,
    },
    card: {
        marginBottom: Spacing.md,
    },
});
