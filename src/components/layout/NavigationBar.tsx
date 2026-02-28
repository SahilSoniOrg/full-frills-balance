/**
 * NavigationBar - App-specific navigation header
 * Provides consistent title, back button and actions across screens
 */

import { AppText, IconButton } from '@/src/components/core'
import { Spacing } from '@/src/constants/design-tokens'
import { useRouter } from 'expo-router'
import React from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'

export type NavigationBarProps = {
    title: string
    subtitle?: string
    onBack?: () => void
    showBack?: boolean
    backIcon?: 'back' | 'close'
    rightActions?: React.ReactNode
    isSearchActive?: boolean
    alignTitle?: 'center' | 'left'
    style?: ViewStyle
}

export function NavigationBar({
    title,
    subtitle,
    onBack,
    showBack = true,
    backIcon = 'back',
    rightActions,
    isSearchActive = false,
    alignTitle = 'center',
    style
}: NavigationBarProps) {
    const router = useRouter()

    const handleBack = () => {
        if (onBack) {
            onBack()
        } else {
            router.back()
        }
    }

    return (
        <View style={[styles.container, style]}>
            {(showBack || alignTitle === 'center') && (
                <View style={[styles.left, !showBack && styles.noWidth]}>
                    {showBack && !isSearchActive && (
                        <IconButton
                            name={backIcon}
                            onPress={handleBack}
                            variant="surface"
                            style={styles.backButton}
                        />
                    )}
                </View>
            )}

            {!isSearchActive && (
                <View style={[
                    styles.center,
                    alignTitle === 'left' && styles.centerLeft
                ]}>
                    <AppText
                        variant="subheading"
                        style={[styles.title, alignTitle === 'left' && styles.titleLeft]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                    >
                        {title}
                    </AppText>
                    {subtitle && (
                        <AppText
                            variant="caption"
                            color="secondary"
                            numberOfLines={1}
                            ellipsizeMode="tail"
                        >
                            {subtitle}
                        </AppText>
                    )}
                </View>
            )}

            <View style={[styles.right, isSearchActive && styles.rightSearchActive]}>
                {rightActions}
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        height: 64, // Standard header height
    },
    noWidth: {
        width: 0,
    },
    left: {
        width: 48,
        alignItems: 'flex-start',
    },
    center: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
    },
    centerLeft: {
        alignItems: 'flex-start',
        paddingLeft: 0,
    },
    right: {
        minWidth: 48,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    rightSearchActive: {
        flex: 1,
    },
    backButton: {
        // IconButton defaults are good
    },
    title: {
        textAlign: 'center',
    },
    titleLeft: {
        textAlign: 'left',
    }
})
