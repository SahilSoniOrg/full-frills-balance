import { AppButton, AppIcon, AppText, type AppButtonProps, type IconName } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type SettingsActionRowProps = {
    title: string;
    description: string;
    actionLabel: string;
    onPress: () => void;
    icon?: IconName;
    actionVariant?: AppButtonProps['variant'];
    actionLoading?: boolean;
    actionStyle?: StyleProp<ViewStyle>;
    withDivider?: boolean;
};

export function SettingsActionRow({
    title,
    description,
    actionLabel,
    onPress,
    icon,
    actionVariant = 'secondary',
    actionLoading = false,
    actionStyle,
    withDivider = false,
}: SettingsActionRowProps) {
    const { theme } = useTheme();

    return (
        <>
            <View style={styles.rowBetween}>
                {icon ? (
                    <AppIcon name={icon} size={24} color={theme.primary} style={{ marginRight: Spacing.md }} />
                ) : null}
                <View style={styles.content}>
                    <AppText variant="body" weight="semibold">{title}</AppText>
                    <AppText variant="caption" color="secondary">{description}</AppText>
                </View>
                <AppButton
                    variant={actionVariant}
                    size="sm"
                    onPress={onPress}
                    loading={actionLoading}
                    style={actionStyle}
                >
                    {actionLabel}
                </AppButton>
            </View>
            {withDivider ? (
                <View style={[styles.divider, { backgroundColor: theme.divider }]} />
            ) : null}
        </>
    );
}

const styles = StyleSheet.create({
    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    content: {
        flex: 1,
        marginRight: Spacing.md,
    },
    divider: {
        height: 1,
        marginVertical: Spacing.md,
    },
});
