import { AccountPickerList } from '@/src/components/common/AccountPickerList';
import { BaseAccountPickerModal } from '@/src/components/common/BaseAccountPickerModal';
import { AppIcon, AppSegmentedControl, AppText, ListRow } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import Account, { AccountType } from '@/src/data/models/Account';
import { Box, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import {
  BalanceChangeCounterparty,
  filterEligibleCounterparties,
  filterSuggestedCounterparties,
} from '@/src/services/accounts/balanceChangeClassification';
import { AccountId, PlainAccount } from '@/src/types/domain';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

type PickerMode = 'suggested' | 'all';

export interface BalanceChangeClassifySheetProps {
  visible: boolean;
  accounts: (Account | PlainAccount)[];
  editedAccountId: AccountId;
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

  const handleAccountSelect = (accountId: AccountId) => {
    onSelect({ kind: 'account', accountId });
  };

  const handleAdjustment = () => {
    onSelect({ kind: 'adjustment' });
  };

  const handleClose = () => {
    setMode('suggested');
    onClose();
  };

  return (
    <BaseAccountPickerModal visible={visible} onClose={handleClose} title={copy.title}>
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

        <ListRow
          title={copy.adjustment}
          subtitle={copy.adjustmentSubtitle}
          leading={
            <Box
              style={[
                styles.adjustmentIcon,
                { backgroundColor: withOpacity(theme.equity, Opacity.soft) },
              ]}
            >
              <AppIcon name="scale" size={Size.iconSm} color={theme.equity} />
            </Box>
          }
          onPress={handleAdjustment}
          showSeparator
          accessibilityLabel={copy.adjustment}
        />
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
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  adjustmentIcon: {
    width: Size.iconLg,
    height: Size.iconLg,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
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
