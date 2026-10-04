import { AppSurface, AppText, AppIcon, Icon, PressScaleTouchable } from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { Row } from '@/src/design-system';
import type { PlainAccount, PlainBudget } from '@/src/types/plainDtos';
import { formatRecurrence } from '@/src/utils/recurrenceLabels';

interface Props {
  budget: PlainBudget;
  periodRange: { startDate: number; endDate: number };
  scopeAccounts: PlainAccount[];
  fundingAccounts: PlainAccount[];
  isLoadingScope: boolean;
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
    <AppSurface padding="none" radius="r3" background="surface">
      <PressScaleTouchable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`${strings.setup} · ${summary}`}
        style={{ minHeight: Size.touchTarget }}
        surfaceStyle={{ padding: Spacing.sm }}
      >
        <Row align="center" gap="xs">
          <AppText variant="body" weight="medium">
            {strings.setup}
          </AppText>
          <AppText variant="caption" color="secondary" style={{ flex: 1 }}>
            {summary}
          </AppText>
          <AppIcon name={Icon.ChevronRight} size={Size.iconSm} color="secondary" />
        </Row>
      </PressScaleTouchable>
    </AppSurface>
  );
}
