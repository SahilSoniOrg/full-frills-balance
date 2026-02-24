import { AppButton, AppCard, AppIcon, AppText } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

type PopupModalAction = {
    label: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
};

interface PopupModalProps {
    visible: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    actions: PopupModalAction[];
    maxHeightPercent?: number;
    accessibilityCloseLabel?: string;
    fixedHeight?: boolean;
    scrollable?: boolean;
}

export function PopupModal({
    visible,
    title,
    onClose,
    children,
    actions,
    maxHeightPercent = 84,
    accessibilityCloseLabel = 'Close popup',
    fixedHeight = true,
    scrollable = true,
}: PopupModalProps) {
    const { theme } = useTheme();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={accessibilityCloseLabel}
                />
                <View style={[
                    styles.modalContainer,
                    fixedHeight
                        ? { height: `${maxHeightPercent}%` }
                        : { maxHeight: `${maxHeightPercent}%` }
                ]}>
                    <AppCard
                        elevation="lg"
                        padding="lg"
                        radius="r2"
                        style={[
                            styles.modalCard,
                            fixedHeight ? styles.modalCardFixed : styles.modalCardFit,
                            { backgroundColor: theme.surface }
                        ]}
                    >
                        <View style={styles.header}>
                            <AppText variant="subheading" weight="bold">{title}</AppText>
                            <TouchableOpacity
                                onPress={onClose}
                                accessibilityRole="button"
                                accessibilityLabel={accessibilityCloseLabel}
                            >
                                <AppIcon name="close" size={Size.sm} color={theme.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {scrollable ? (
                            <ScrollView
                                contentContainerStyle={styles.scrollContent}
                                style={fixedHeight ? styles.scrollFixed : styles.scrollFit}
                                showsVerticalScrollIndicator={false}
                            >
                                {children}
                            </ScrollView>
                        ) : (
                            <View style={styles.staticContent}>
                                {children}
                            </View>
                        )}

                        <View style={[styles.bottomBar, { borderTopColor: theme.border }]}>
                            {actions.map((action, index) => (
                                <AppButton
                                    key={`${action.label}-${index}`}
                                    variant={action.variant || 'primary'}
                                    onPress={action.onPress}
                                    style={styles.actionButton}
                                >
                                    {action.label}
                                </AppButton>
                            ))}
                        </View>
                    </AppCard>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        padding: Spacing.lg,
    },
    modalContainer: {
        width: '100%',
        maxWidth: 460,
        flexShrink: 1,
    },
    modalCard: {
        width: '100%',
        borderRadius: Shape.radius.lg,
    },
    modalCardFixed: {
        height: '100%',
    },
    modalCardFit: {
        maxHeight: '100%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    scrollFixed: {
        marginTop: Spacing.md,
        flex: 1,
        minHeight: 0,
    },
    scrollFit: {
        marginTop: Spacing.md,
        flexGrow: 0,
    },
    scrollContent: {
        gap: Spacing.md,
        paddingBottom: Spacing.md,
    },
    staticContent: {
        marginTop: Spacing.md,
        gap: Spacing.md,
    },
    bottomBar: {
        marginTop: Spacing.md,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    actionButton: {
        flex: 1,
        borderRadius: Shape.radius.full,
    },
});
