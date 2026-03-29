import { AppButton } from '@/src/components/core/AppButton'
import { AppText } from '@/src/components/core/AppText'
import { Spacing } from '@/src/constants'
import React from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'

export interface EmptyStateViewProps {
    title: string
    subtitle?: string
    style?: ViewStyle
    primaryActionLabel?: string
    onPrimaryAction?: () => void
}

export function EmptyStateView({ title, subtitle, style, primaryActionLabel, onPrimaryAction }: EmptyStateViewProps) {
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
            {primaryActionLabel && onPrimaryAction ? (
                <AppButton
                    onPress={onPrimaryAction}
                    style={styles.actionButton}
                    accessibilityLabel={primaryActionLabel}
                >
                    {primaryActionLabel}
                </AppButton>
            ) : null}
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
    actionButton: {
        marginTop: Spacing.lg,
    },
})
