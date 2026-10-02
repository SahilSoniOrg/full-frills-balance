import { Icon, AppButton, AppText, IconButton } from '@/src/components/core';
import { DetailDisclosure } from '@/src/components/shared/DetailDisclosure';
import { Spacing } from '@/src/constants';
import { Column, Separator } from '@/src/design-system';
import { PlainAccount, PlainBudget } from '@/src/types/plainDtos';
import { AppNavigation } from '@/src/utils/navigation';
import { formatRecurrence } from '@/src/utils/recurrenceLabels';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

interface Props {
  budget: PlainBudget;
  periodRange: { startDate: number; endDate: number };
  scopeAccounts: PlainAccount[];
  fundingAccounts: PlainAccount[];
  isLoadingScope: boolean;
  isLoadingFunding: boolean;
  onEdit: () => void;
}

export function BudgetSetupDisclosure({
  budget,
  periodRange,
  scopeAccounts,
  fundingAccounts,
  isLoadingScope,
  isLoadingFunding,
  onEdit,
}: Props) {
  const recurrence = formatRecurrence(budget);
  return (
    <DetailDisclosure
      title="Budget setup"
      icon={Icon.Sliders}
      summary={`${recurrence} · ${scopeAccounts.length > 0 ? scopeAccounts.map(account => account.name).join(' · ') : 'No expense categories selected'}`}
      action={
        <IconButton
          name={Icon.Edit}
          variant="clear"
          accessibilityLabel="Edit budget setup"
          onPress={onEdit}
        />
      }
    >
      <Column gap="sm">
        <AppText variant="caption" color="secondary">
          Resets
        </AppText>
        <AppText variant="body">{recurrence}</AppText>
        <Separator marginVertical="sm" />
        <AppText variant="caption" color="secondary">
          Expense categories
        </AppText>
        <AccountLinks
          accounts={scopeAccounts}
          isLoading={isLoadingScope}
          loadingText="Loading categories…"
          range={periodRange}
          empty={
            <AppText color="warning">
              No categories selected. This budget cannot track spending yet.
            </AppText>
          }
        />
        <AppText variant="caption" color="secondary">
          Includes subcategories. Recorded spending and refunds determine usage.
        </AppText>
        <Separator marginVertical="sm" />
        <AppText variant="caption" color="secondary">
          Forecast funding accounts
        </AppText>
        <AccountLinks
          accounts={fundingAccounts}
          isLoading={isLoadingFunding}
          loadingText="Loading accounts…"
          empty={
            <AppText variant="body">
              {budget.assetAccountIds
                ? 'Selected accounts are unavailable'
                : 'Automatic account selection'}
            </AppText>
          }
        />
        <AppText variant="caption" color="secondary">
          Funding accounts affect the forecast; category spending counts from any account.
        </AppText>
      </Column>
    </DetailDisclosure>
  );
}

function AccountLinks({
  accounts,
  isLoading,
  loadingText,
  range,
  empty,
}: {
  accounts: PlainAccount[];
  isLoading: boolean;
  loadingText: string;
  range?: { startDate: number; endDate: number };
  empty: ReactNode;
}) {
  if (isLoading) return <AppText color="secondary">{loadingText}</AppText>;
  if (accounts.length === 0) return empty;
  return accounts.map(account => (
    <AppButton
      key={account.id}
      variant="ghost"
      onPress={() => AppNavigation.toAccountDetails(account.id, range)}
      buttonStyle={styles.accountButton}
    >
      <AppText variant="body" weight="medium" color="primary" align="left">
        {account.name}
      </AppText>
    </AppButton>
  ));
}

const styles = StyleSheet.create({
  accountButton: { alignItems: 'stretch', paddingHorizontal: 0, paddingVertical: Spacing.sm },
});
