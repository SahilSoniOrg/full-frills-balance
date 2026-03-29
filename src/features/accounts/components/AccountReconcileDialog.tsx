import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface AccountReconcileDialogProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: () => void;
    balanceText: string;
    unreconciledCount: number;
}

export function AccountReconcileDialog({
    visible,
    onClose,
    onConfirm,
    balanceText,
    unreconciledCount,
}: AccountReconcileDialogProps) {
    const { theme } = useTheme();

    return (
        <ConfirmDialog
            visible={visible}
            onClose={onClose}
            title={AppConfig.strings.accounts.reconciliation.alert.title}
            secondaryAction={{
                label: AppConfig.strings.common.cancel,
                onPress: onClose,
                variant: 'ghost',
            }}
            primaryAction={{
                label: 'Reconcile',
                onPress: onConfirm,
                variant: 'primary',
            }}
        >
            <AppText style={{ color: theme.textSecondary, marginBottom: 12 }}>
                {AppConfig.strings.accounts.reconciliation.alert.message}
            </AppText>

            {unreconciledCount > 0 ? (
                <View style={[styles.summaryCard, { backgroundColor: theme.surfaceSecondary }]}>
                    <AppText style={{ color: theme.text, fontWeight: '600', marginBottom: 4 }}>
                        {AppConfig.strings.accounts.reconciliation.alert.matchingBalance(balanceText)}
                    </AppText>
                    <AppText style={{ color: theme.textSecondary, fontSize: 13 }}>
                        {AppConfig.strings.accounts.reconciliation.alert.pendingTransactions(unreconciledCount)}
                    </AppText>
                </View>
            ) : null}

            <AppText style={{ color: theme.textSecondary, fontSize: 13, fontStyle: 'italic' }}>
                {AppConfig.strings.accounts.reconciliation.alert.guide}
            </AppText>
        </ConfirmDialog>
    );
}

const styles = StyleSheet.create({
    summaryCard: {
        padding: 12,
        borderRadius: 8,
        marginBottom: Spacing.md,
    },
});
