import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

interface ScreenSectionHeaderProps {
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

export function ScreenSectionHeader({
    title,
    subtitle,
    action,
    style,
}: ScreenSectionHeaderProps) {
    return (
        <View style={[styles.container, style]}>
            <View style={styles.copy}>
                <AppText variant="subheading" weight="bold">
                    {title}
                </AppText>
                {subtitle ? (
                    <AppText variant="caption" color="secondary" style={styles.subtitle}>
                        {subtitle}
                    </AppText>
                ) : null}
            </View>
            {action ? <View style={styles.action}>{action}</View> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: Spacing.md,
    },
    copy: {
        flex: 1,
    },
    subtitle: {
        marginTop: Spacing.xs,
    },
    action: {
        flexShrink: 0,
    },
});
