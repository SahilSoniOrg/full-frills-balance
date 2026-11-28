import { AppText, Badge } from '@/src/components/core';
import { Inline, Stack } from '@/src/design-system';
import type { PersonBalanceSummary } from '@/src/domain/people/personTypes';
import { Icon } from '@/src/types/domainIcons';
import { filterActivePersonCurrencies } from '../helpers/filterActivePersonCurrencies';

type Props = {
  summary: PersonBalanceSummary;
  personName: string;
  formatAmount?: (amount: number, currencyCode: string) => string;
};

/** Detail balance block with full copy and optional converted estimate. */
export function PersonBalanceBadge({
  summary,
  personName,
  formatAmount = (amount, currency) => `${currency} ${amount.toFixed(2)}`,
}: Props) {
  const activeCurrencies = filterActivePersonCurrencies(summary.currencies);
  const showConvertedNet =
    Boolean(summary.convertedNet?.isInformational) &&
    (activeCurrencies.length > 1 ||
      (activeCurrencies.length === 1 &&
        summary.convertedNet!.currencyCode !== activeCurrencies[0]!.currencyCode) ||
      (activeCurrencies.length === 0 && summary.convertedNet!.amount !== 0));

  return (
    <Stack gap="sm" accessibilityLabel={`${personName} balances`}>
      {activeCurrencies.length === 0 ? (
        <Inline gap="sm" alignItems="center" flexWrap="wrap">
          <Badge size="sm" variant="income" icon={Icon.CheckCircle}>
            All settled
          </Badge>
        </Inline>
      ) : (
        activeCurrencies.map(balance => {
          const showBothDirections = balance.owedToYou !== 0 && balance.youOwe !== 0;
          return (
            <Stack key={balance.currencyCode} gap="none">
              {balance.owedToYou !== 0 ? (
                <AppText variant="body" weight="semibold" color="income" tabular>
                  {`${personName} owes you ${formatAmount(balance.owedToYou, balance.currencyCode)}`}
                </AppText>
              ) : null}
              {balance.youOwe !== 0 ? (
                <AppText variant="body" weight="semibold" color="expense" tabular>
                  {`You owe ${personName} ${formatAmount(balance.youOwe, balance.currencyCode)}`}
                </AppText>
              ) : null}
              {showBothDirections ? (
                <AppText variant="caption" color="secondary" tabular>
                  Net: {formatAmount(balance.net, balance.currencyCode)}
                </AppText>
              ) : null}
            </Stack>
          );
        })
      )}
      {showConvertedNet && summary.convertedNet ? (
        <Inline gap="xs" alignItems="center">
          <Badge size="sm">
            Est. net ~{formatAmount(summary.convertedNet.amount, summary.convertedNet.currencyCode)}
          </Badge>
        </Inline>
      ) : null}
    </Stack>
  );
}
