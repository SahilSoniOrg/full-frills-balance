import { AppText, ListGroup, ListRow } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import type { PlainAccount, PlainBudget } from '@/src/types/plainDtos';
import { formatRecurrence } from '@/src/utils/recurrenceLabels';

interface Props {
  budget: PlainBudget;
  fundingAccounts: PlainAccount[];
  isLoadingFunding: boolean;
  onEdit: () => void;
}

/** Setup stays a single edit target; account navigation lives in the activity rows. */
export function BudgetSetupDisclosure({
  budget,
  fundingAccounts,
  isLoadingFunding,
  onEdit,
}: Props) {
  const strings = AppConfig.strings.budgetDetailRedesign;
  const accounts = isLoadingFunding
    ? strings.loadingAccounts
    : fundingAccounts.length > 0
      ? fundingAccounts.map(account => account.name).join(', ')
      : budget.assetAccountIds
        ? strings.selectedAccountsUnavailable
        : strings.noFundingAccounts;
  const summary = strings.setupSummary(formatRecurrence(budget), accounts);
  return (
    <ListGroup>
      <ListRow
        title={
          <AppText variant="body" weight="medium">
            {strings.setup}
          </AppText>
        }
        subtitle={
          <AppText variant="caption" color="secondary">
            {summary}
          </AppText>
        }
        onPress={onEdit}
        accessibilityLabel={`${strings.setup} · ${summary}`}
        chevron
      />
    </ListGroup>
  );
}
