import { AppText, Badge } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

interface EntryEditBannerProps {
    text: string;
    style?: StyleProp<ViewStyle>;
}

export function EntryEditBanner({ text, style }: EntryEditBannerProps) {
    const { theme } = useTheme();

    return (
        <View style={[styles.editBanner, { backgroundColor: withOpacity(theme.warning, Opacity.soft) }, style]}>
            <Badge variant="expense" size="sm">{AppConfig.strings.advancedEntry.editing || 'EDITING'}</Badge>
            <AppText variant="caption" color="secondary" style={{ marginLeft: Spacing.sm }}>
                {text}
            </AppText>
        </View>
    );
}

const styles = StyleSheet.create({
    editBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.sm,
        borderRadius: Shape.radius.sm,
    },
});
