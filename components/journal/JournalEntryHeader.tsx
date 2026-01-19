import { AppText } from '@/components/core';
import { Spacing, ThemeMode } from '@/constants';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalEntryHeaderProps {
    title: string;
    theme: any;
    themeMode: ThemeMode;
    onClose?: () => void;
}

export const JournalEntryHeader = ({ title, theme, themeMode, onClose }: JournalEntryHeaderProps) => {
    const router = useRouter();

    const handleClose = onClose || (() => router.back());

    return (
        <View style={[styles.header, { backgroundColor: theme.background }]}>
            <TouchableOpacity onPress={handleClose} style={styles.backButton}>
                <Ionicons name="close" size={28} color={theme.text} />
            </TouchableOpacity>

            <AppText variant="heading" themeMode={themeMode} style={styles.headerTitle}>
                {title}
            </AppText>

            <TouchableOpacity onPress={() => router.push('/(tabs)' as any)} style={styles.listButton}>
                <Ionicons name="list" size={24} color={theme.text} />
            </TouchableOpacity>
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
