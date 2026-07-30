import { AccountPickerList } from '@/src/components/common/AccountPickerList';
import { BaseAccountPickerModal } from '@/src/components/common/BaseAccountPickerModal';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { AppIcon, AppSegmentedControl, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import Account, { AccountType } from '@/src/data/models/Account';
import { Box, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import {
  BalanceChangeCounterparty,
  filterEligibleCounterparties,
  filterSuggestedCounterparties,
  getBalanceChangeJournalLabel,
} from '@/src/services/accounts/balanceChangeClassification';
import { AccountId, PlainAccount } from '@/src/types/domain';
import { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type PickerMode = 'suggested' | 'all';

type PendingConfirmation = {
  counterparty: BalanceChangeCounterparty;
  transactionLabel: string;
  otherName: string;
  isAdjustment: boolean;
};

export interface BalanceChangeClassifySheetProps {
  visible: boolean;
  accounts: (Account | PlainAccount)[];
  editedAccountId: AccountId;
  editedAccountName: string;
  editedAccountType: AccountType;
  currencyCode: string;
  discrepancy: number;
  discrepancyLabel: string;
  onClose: () => void;
  onSelect: (counterparty: BalanceChangeCounterparty) => void;
}

export function BalanceChangeClassifySheet({
  visible,
  accounts,
  editedAccountId,
  editedAccountName,
  editedAccountType,
  currencyCode,
  discrepancy,
  discrepancyLabel,
  onClose,
  onSelect,
}: BalanceChangeClassifySheetProps) {
  const { theme } = useTheme();
  const copy = AppConfig.strings.accounts.balanceClassify;
  const [mode, setMode] = useState<PickerMode>('suggested');
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  const listAccounts = useMemo(() => {
    const input = {
      accountType: editedAccountType,
      discrepancy,
      excludeAccountId: editedAccountId,
      currencyCode,
    };
    const filtered =
      mode === 'suggested'
        ? filterSuggestedCounterparties(accounts, input)
        : filterEligibleCounterparties(accounts, input);
    return filtered as (Account | PlainAccount)[];
  }, [accounts, currencyCode, discrepancy, editedAccountId, editedAccountType, mode]);

  const beginConfirm = (
    counterparty: BalanceChangeCounterparty,
    counterpartyAccountType?: AccountType,
    otherName?: string,
  ) => {
    const transactionLabel = getBalanceChangeJournalLabel({
      editedAccountType,
      discrepancy,
      counterparty,
      counterpartyAccountType,
    });
    setPending({
      counterparty,
      transactionLabel,
      otherName: otherName ?? copy.balanceCorrections,
      isAdjustment: counterparty.kind === 'adjustment',
    });
  };

  const handleAccountSelect = (accountId: AccountId) => {
    const account = accounts.find(a => a.id === accountId);
    beginConfirm(
      { kind: 'account', accountId },
      account?.accountType,
      account?.name ?? copy.balanceCorrections,
    );
  };

  const handleAdjustment = () => {
    beginConfirm({ kind: 'adjustment' }, AccountType.EQUITY, copy.balanceCorrections);
  };

  const handleClose = () => {
    setMode('suggested');
    setPending(null);
    onClose();
  };

  const handleConfirmBack = () => {
    setPending(null);
  };

  const handleConfirmCreate = () => {
    if (!pending) return;
    const { counterparty } = pending;
    setPending(null);
    onSelect(counterparty);
  };

  const confirmMessage = pending
    ? pending.isAdjustment
      ? copy.confirmAdjustmentMessage(discrepancyLabel, editedAccountName)
      : copy.confirmMessage(
          pending.transactionLabel,
          discrepancyLabel,
          editedAccountName,
          pending.otherName,
        )
    : '';

  const showPicker = visible && !pending;

  return (
    <>
      <BaseAccountPickerModal visible={showPicker} onClose={handleClose} title={copy.title}>
        <Stack space="md" style={styles.headerBlock}>
          <AppText variant="body" color="secondary">
            {copy.subtitle(discrepancyLabel)}
          </AppText>

          <AppSegmentedControl<PickerMode>
            flex
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { id: 'suggested', label: copy.suggested },
              { id: 'all', label: copy.allAccounts },
            ]}
            testID="balance-classify-mode"
          />

          <TouchableOpacity
            onPress={handleAdjustment}
            style={[styles.adjustmentRow, { borderBottomColor: theme.border }]}
            accessibilityRole="button"
            accessibilityLabel={`${copy.adjustment}. ${copy.adjustmentSubtitle}`}
            activeOpacity={Opacity.heavy}
            testID="balance-classify-adjustment"
          >
            <Box
              style={[
                styles.adjustmentIcon,
                { backgroundColor: withOpacity(theme.equity, Opacity.soft) },
              ]}
            >
              <AppIcon name="scale" size={Size.iconSm} color={theme.equity} />
            </Box>
            <View style={styles.adjustmentCopy}>
              <AppText variant="body" weight="medium">
                {copy.adjustment}
              </AppText>
              <AppText variant="caption" color="secondary" style={styles.adjustmentSubtitle}>
                {copy.adjustmentSubtitle}
              </AppText>
            </View>
          </TouchableOpacity>
        </Stack>

        {listAccounts.length === 0 ? (
          <View style={styles.emptyState}>
            <AppText variant="body" color="secondary" style={styles.emptyText}>
              {mode === 'suggested' ? copy.emptySuggested : copy.emptyAll}
            </AppText>
          </View>
        ) : (
          <AccountPickerList
            accounts={listAccounts}
            selectedIds={new Set()}
            onSelect={handleAccountSelect}
            onClose={handleClose}
            isMultiple={false}
            excludeParentAccounts={false}
          />
        )}
      </BaseAccountPickerModal>

      <ConfirmDialog
        visible={visible && !!pending}
        title={copy.confirmTitle}
        message={confirmMessage}
        onClose={handleConfirmBack}
        useNativeModal
        secondaryAction={{
          label: copy.confirmBack,
          onPress: handleConfirmBack,
          variant: 'ghost',
        }}
        primaryAction={{
          label: copy.confirmPrimary,
          onPress: handleConfirmCreate,
          variant: 'primary',
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    width: '100%',
    alignSelf: 'stretch',
  },
  adjustmentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    width: '100%',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  adjustmentIcon: {
    width: Size.iconLg,
    height: Size.iconLg,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  adjustmentCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs / 2,
  },
  adjustmentSubtitle: {
    lineHeight: 18,
  },
  emptyState: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  emptyText: {
    textAlign: 'center',
  },
});
