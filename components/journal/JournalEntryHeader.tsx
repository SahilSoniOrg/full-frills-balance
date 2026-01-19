import { AppText } from '@/components/core';
import { Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';
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
                <Ionicons name="close" size={28} color={theme.text} />
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
    },
    listButton: {
        padding: Spacing.sm,
    },
});
