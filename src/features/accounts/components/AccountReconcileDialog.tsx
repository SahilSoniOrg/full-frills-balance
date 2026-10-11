import { ConfirmDialog } from '@/src/components/overlays/ConfirmDialog';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { AppText } from '@/src/components/core';
import { AppConfig, Shape, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { StyleSheet, View } from 'react-native';

interface AccountReconcileDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  balanceAmount: number;
  currencyCode: string;
  unreconciledCount: number;
}

export function AccountReconcileDialog({
  visible,
  onClose,
  onConfirm,
  balanceAmount,
  currencyCode,
  unreconciledCount,
}: AccountReconcileDialogProps) {
  const { theme } = useTheme();
  const isPrivate = useEffectivePrivacyMode();
  const formatMoney = useMoneyFormat();
  const balanceText = formatMoney(balanceAmount, currencyCode);

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
        label: AppConfig.strings.accounts.reconciliation.alert.confirmLabel,
        onPress: onConfirm,
        variant: 'primary',
        disabled: isPrivate,
      }}
    >
      <View style={styles.content}>
        <AppText color="secondary">
          {AppConfig.strings.accounts.reconciliation.alert.message}
        </AppText>
        <View style={[styles.summaryCard, { backgroundColor: theme.surfaceSecondary }]}>
          <AppText weight="semibold" style={{ color: theme.text }}>
            {AppConfig.strings.accounts.reconciliation.alert.matchingBalance(balanceText)}
          </AppText>
          {unreconciledCount > 0 ? (
            <AppText variant="bodySmall" color="secondary">
              {AppConfig.strings.accounts.reconciliation.alert.pendingTransactions(
                unreconciledCount,
              )}
            </AppText>
          ) : null}
        </View>
        <AppText variant="bodySmall" color="secondary">
          {isPrivate
            ? AppConfig.strings.accounts.reconciliation.alert.privacyHint
            : AppConfig.strings.accounts.reconciliation.alert.guide}
        </AppText>
      </View>
    </ConfirmDialog>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: Spacing.md,
  },
  summaryCard: {
    padding: Spacing.md,
    borderRadius: Shape.radius.sm,
    gap: Spacing.xs,
  },
});
