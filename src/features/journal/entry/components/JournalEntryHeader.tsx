import { AppIcon, AppText } from '@/src/components/core';
import { Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalEntryHeaderProps {
    title: string;
    onClose?: () => void;
}

export const JournalEntryHeader = ({ title, onClose }: JournalEntryHeaderProps) => {
    const router = useRouter();
    const { theme } = useTheme();

    const handleClose = onClose || (() => router.back());

    return (
        <View style={[styles.header, { backgroundColor: theme.background }]}>
            <TouchableOpacity onPress={handleClose} style={styles.backButton}>
                <AppIcon name="close" size={28} color={theme.text} />
            </TouchableOpacity>

            <AppText variant="heading" style={styles.headerTitle}>
                {title}
            </AppText>

            <View style={{ width: 44 }} />
        </View>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.lg,
    },
    backButton: {
        padding: Spacing.sm,
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        fontFamily: Typography.fonts.bold,
    },
    listButton: {
        padding: Spacing.sm,
    },
});
