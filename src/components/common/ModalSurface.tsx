import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

interface ModalSurfaceProps {
    visible: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxHeightPercent?: number;
    accessibilityCloseLabel?: string;
    fixedHeight?: boolean;
    scrollable?: boolean;
}

export function ModalSurface({
    visible,
    title,
    onClose,
    children,
    footer,
    maxHeightPercent = AppConfig.layout.popupModalHeightPercent,
    accessibilityCloseLabel = 'Close dialog',
    fixedHeight = true,
    scrollable = true,
}: ModalSurfaceProps) {
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
                <View
                    style={[
                        styles.modalContainer,
                        fixedHeight ? { height: `${maxHeightPercent}%` } : { maxHeight: `${maxHeightPercent}%` },
                    ]}
                >
                    <AppCard
                        elevation="lg"
                        padding="lg"
                        radius="r2"
                        style={[
                            styles.modalCard,
                            fixedHeight ? styles.modalCardFixed : styles.modalCardFit,
                            { backgroundColor: theme.surface },
                        ]}
                    >
                        <View style={styles.header}>
                            <AppText variant="subheading" weight="bold">
                                {title}
                            </AppText>
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
                            <View style={styles.staticContent}>{children}</View>
                        )}

                        {footer}
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
        alignItems: 'center',
        padding: Spacing.lg,
    },
    modalContainer: {
        width: '100%',
        maxWidth: AppConfig.layout.popupModalMaxWidth,
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
});
