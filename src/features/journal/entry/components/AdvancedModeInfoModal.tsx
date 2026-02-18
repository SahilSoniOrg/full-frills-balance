import { AppButton, AppCard, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

interface AdvancedModeInfoModalProps {
    visible: boolean;
    onClose: () => void;
}

export const AdvancedModeInfoModal = ({ visible, onClose }: AdvancedModeInfoModalProps) => {
    const { theme } = useTheme();
    const str = AppConfig.strings.advancedModeExplanation;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={[styles.overlay, { backgroundColor: theme.background + 'CC' }]}>
                <AppCard
                    elevation="lg"
                    padding="none"
                    style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                    <View style={[styles.header, { borderBottomColor: theme.border }]}>
                        <AppText variant="heading">{str.title}</AppText>
                        <AppButton
                            variant="ghost"
                            onPress={onClose}
                            style={styles.closeButton}
                        >
                            <AppIcon name="close" size={Size.iconSm} color={theme.textSecondary} />
                        </AppButton>
                    </View>

                    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                        <View style={styles.section}>
                            <AppText variant="body">{str.intro}</AppText>
                        </View>

                        <View style={[styles.highlightSection, { backgroundColor: theme.surfaceSecondary }]}>
                            <AppText variant="body" weight="medium" color="primary">{str.unlocks}</AppText>
                        </View>

                        <View style={styles.section}>
                            <AppText variant="heading" style={styles.sectionTitle}>{str.exampleTitle}</AppText>
                            <AppText variant="body" style={styles.scenario}>{str.exampleScenario}</AppText>

                            <View style={[styles.exampleBox, { borderColor: theme.border }]}>
                                {str.exampleItems.map((item, index) => (
                                    <View key={index} style={styles.exampleItem}>
                                        <AppIcon name="chevronRight" size={Size.iconXs} color={theme.primary} />
                                        <AppText variant="caption" weight="medium" style={{ flex: 1 }}>{item}</AppText>
                                    </View>
                                ))}
                            </View>
                        </View>

                        <View style={styles.section}>
                            <AppText variant="heading" style={styles.sectionTitle}>{str.whyBetterTitle}</AppText>
                            {str.benefits.map((benefit, index) => {
                                const [title, content] = benefit.split(': ');
                                return (
                                    <View key={index} style={styles.benefitItem}>
                                        <AppText variant="body" weight="bold">{title}:</AppText>
                                        <AppText variant="body" color="secondary">{content}</AppText>
                                    </View>
                                );
                            })}
                        </View>

                        <View style={styles.footer}>
                            <AppText variant="caption" italic style={{ color: theme.textSecondary, textAlign: 'center' }}>
                                {str.footer}
                            </AppText>
                        </View>
                    </ScrollView>

                    <View style={[styles.bottomBar, { borderTopColor: theme.border }]}>
                        <AppButton
                            variant="primary"
                            onPress={onClose}
                            style={styles.gotItButton}
                        >
                            Got it!
                        </AppButton>
                    </View>
                </AppCard>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    modalCard: {
        width: '100%',
        maxWidth: 450,
        maxHeight: '85%',
        borderRadius: Shape.radius.lg,
        borderWidth: 1,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
    },
    closeButton: {
        padding: Spacing.xs,
        minWidth: 0,
        height: 'auto',
    },
    scrollContent: {
        padding: Spacing.lg,
        gap: Spacing.lg,
    },
    section: {
        gap: Spacing.sm,
    },
    sectionTitle: {
        fontSize: 16,
    },
    highlightSection: {
        padding: Spacing.md,
        borderRadius: Shape.radius.md,
    },
    scenario: {
        opacity: Opacity.soft,
    },
    exampleBox: {
        borderWidth: 1,
        borderRadius: Shape.radius.md,
        padding: Spacing.md,
        gap: Spacing.xs,
        marginTop: Spacing.xs,
    },
    exampleItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    benefitItem: {
        marginBottom: Spacing.sm,
    },
    footer: {
        marginTop: Spacing.md,
        paddingTop: Spacing.lg,
    },
    bottomBar: {
        padding: Spacing.lg,
        borderTopWidth: 1,
    },
    gotItButton: {
        borderRadius: Shape.radius.full,
    },
});
