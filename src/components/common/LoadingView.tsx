import { AppText } from '@/src/components/core/AppText'
import { Spacing } from '@/src/constants'
import React from 'react'
import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native'

export interface LoadingViewProps {
    loading: boolean
    text?: string
    size?: 'small' | 'large'
    style?: ViewStyle
}

export function LoadingView({ loading, text = 'Loading...', size = 'large', style }: LoadingViewProps) {
    if (!loading) return null

    return (
        <View style={[styles.container, style]}>
            <ActivityIndicator size={size} />
            <AppText variant="body" color="secondary" style={styles.text}>
                {text}
            </AppText>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    text: {
        marginTop: Spacing.sm,
    },
})
