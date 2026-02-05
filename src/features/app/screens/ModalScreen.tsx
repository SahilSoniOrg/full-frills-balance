import { AppButton, AppCard, AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Link } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export function ModalScreen() {
    const { theme } = useTheme();

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <AppCard elevation="md" padding="lg">
                <AppText variant="heading" style={styles.title}>
                    This is a modal
                </AppText>
                <Link href="/" dismissTo style={styles.link}>
                    <AppButton variant="outline">
                        Go to home screen
                    </AppButton>
                </Link>
            </AppCard>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.lg,
    },
    title: {
        textAlign: 'center',
        marginBottom: Spacing.lg,
    },
    link: {
        marginTop: Spacing.md,
    },
});
