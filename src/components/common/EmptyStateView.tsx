import { AppText } from '@/src/components/core/AppText'
import { Spacing } from '@/src/constants'
import React from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'

export interface EmptyStateViewProps {
    title: string
    subtitle?: string
    style?: ViewStyle
}

export function EmptyStateView({ title, subtitle, style }: EmptyStateViewProps) {
    return (
        <View style={[styles.container, style]}>
            <AppText variant="heading" style={styles.title}>
                {title}
            </AppText>
            {subtitle && (
                <AppText variant="body" color="secondary" style={styles.subtitle}>
                    {subtitle}
                </AppText>
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: Spacing.xxxxl * 2,
    },
    title: {
        marginBottom: Spacing.sm,
    },
    subtitle: {
        textAlign: 'center',
    },
})
