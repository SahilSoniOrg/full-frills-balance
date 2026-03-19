import { AppButton, AppIcon, AppText, type AppButtonProps, type IconName } from '@/src/components/core';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Inline, Stack, Separator } from '@/src/design-system';

type SettingsActionRowProps = {
    title: string;
    description: string;
    actionLabel: string;
    onPress: () => void;
    icon?: IconName;
    actionVariant?: AppButtonProps['variant'];
    actionLoading?: boolean;
    actionStyle?: StyleProp<ViewStyle>;
    withSeparator?: boolean;
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
    withSeparator = false,
}: SettingsActionRowProps) {
    const { theme } = useTheme();

    return (
        <Stack space="md">
            <Inline align="center" justify="space-between" space="md">
                {icon && (
                    <AppIcon name={icon} size={24} color={theme.primary} />
                )}
                <Stack space="xs" flex={1}>
                    <AppText variant="body" weight="semibold">{title}</AppText>
                    <AppText variant="caption" color="secondary">{description}</AppText>
                </Stack>
                <AppButton
                    variant={actionVariant}
                    size="sm"
                    onPress={onPress}
                    loading={actionLoading}
                    style={actionStyle}
                >
                    {actionLabel}
                </AppButton>
            </Inline>
            {withSeparator && <Separator />}
        </Stack>
    );
}

