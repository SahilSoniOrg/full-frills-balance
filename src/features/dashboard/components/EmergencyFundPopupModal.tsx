import { PopupModal } from '@/src/components/common/PopupModal';
import { AppIcon, AppText } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface EmergencyFundPopupModalProps {
    visible: boolean;
    onClose: () => void;
    onCreateAccount: () => void;
}

export function EmergencyFundPopupModal({
    visible,
    onClose,
    onCreateAccount,
}: EmergencyFundPopupModalProps) {
    const { theme } = useTheme();

    return (
        <PopupModal
            visible={visible}
            title="Build an Emergency Fund"
            onClose={onClose}
            maxHeightPercent={72}
            fixedHeight={false}
            scrollable={false}
            accessibilityCloseLabel="Close emergency fund guidance"
            actions={[
                { label: 'Got it', variant: 'secondary', onPress: onClose },
                { label: 'Create account', variant: 'primary', onPress: onCreateAccount },
            ]}
        >
            <View style={styles.modalSection}>
                <AppText variant="body">
                    This insight appears because we did not detect a dedicated emergency-fund account in your assets.
                </AppText>
            </View>

            <View style={[styles.modalHighlight, { backgroundColor: theme.surfaceSecondary }]}>
                <AppText variant="body" weight="medium" color="primary">
                    A separate emergency fund makes your cash buffer visible and protects routine spending from surprise expenses.
                </AppText>
            </View>

            <View style={styles.modalSection}>
                <AppText variant="heading">How to fix it</AppText>
                <View style={styles.modalStepRow}>
                    <AppIcon name="chevronRight" size={Size.iconXs} color={theme.primary} />
                    <AppText variant="caption" color="secondary" style={styles.modalStepText}>
                        Create a new Asset account.
                    </AppText>
                </View>
                <View style={styles.modalStepRow}>
                    <AppIcon name="chevronRight" size={Size.iconXs} color={theme.primary} />
                    <AppText variant="caption" color="secondary" style={styles.modalStepText}>
                        Select the Emergency Fund subtype.
                    </AppText>
                </View>
                <View style={styles.modalStepRow}>
                    <AppIcon name="chevronRight" size={Size.iconXs} color={theme.primary} />
                    <AppText variant="caption" color="secondary" style={styles.modalStepText}>
                        Start with a small recurring transfer to build momentum.
                    </AppText>
                </View>
            </View>
        </PopupModal>
    );
}

const styles = StyleSheet.create({
    modalSection: {
        gap: Spacing.xs,
    },
    modalHighlight: {
        padding: Spacing.md,
        borderRadius: Shape.radius.md,
    },
    modalStepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.xs,
        marginTop: Spacing.xs,
    },
    modalStepText: {
        flex: 1,
    },
});
