import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { useRouter } from 'expo-router';
import React, { ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalEntryHeaderProps {
    title: string;
    onClose?: () => void;
    rightSlot?: ReactNode;
}

export const JournalEntryHeader = ({ title, onClose, rightSlot }: JournalEntryHeaderProps) => {
    const router = useRouter();
    const { theme, fonts } = useTheme();

    const handleClose = onClose || (() => router.back());

    return (
        <View style={[styles.header, { backgroundColor: theme.background }]}>
            <TouchableOpacity onPress={handleClose} style={styles.backButton} accessibilityLabel={AppConfig.strings.common.cancel} accessibilityRole="button">
                <AppIcon name="close" size={Size.iconMd} color={theme.text} />
            </TouchableOpacity>

            <View style={styles.titleWrap}>
                <AppText variant="heading" style={[styles.headerTitle, { fontFamily: fonts.bold }]} numberOfLines={1}>
                    {title}
                </AppText>
            </View>

            <View style={styles.rightSlot}>
                {rightSlot || <View style={styles.rightPlaceholder} />}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.md,
    },
    backButton: {
        padding: Spacing.sm,
    },
    titleWrap: {
        flex: 1,
        minWidth: 0,
        flexShrink: 1,
        marginLeft: Spacing.sm,
        marginRight: Spacing.md,
    },
    rightSlot: {
        minWidth: 0,
        alignItems: 'flex-end',
        flexShrink: 1,
    },
    rightPlaceholder: {
        width: 44,
        height: 1,
    },
    headerTitle: {
        textAlign: 'left',
        // dynamic font
    },
});
