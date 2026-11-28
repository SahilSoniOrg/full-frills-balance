import { AppText, Badge } from '@/src/components/core';
import { Inline, Stack } from '@/src/design-system';
import type { PersonBalanceSummary } from '@/src/domain/people/personTypes';
import { Icon } from '@/src/types/domainIcons';
import { filterActivePersonCurrencies } from '../helpers/filterActivePersonCurrencies';

type Props = {
  summary: PersonBalanceSummary;
  personName: string;
  fallbackCurrencyCode?: string;
  formatAmount?: (amount: number, currencyCode: string) => string;
};

/** Compact list/secondary balance lines (owes / you owe + net chip). */
export function PersonBalanceInline({
  summary,
  personName,
  fallbackCurrencyCode,
  formatAmount = (amount, currency) => `${currency} ${amount.toFixed(2)}`,
}: Props) {
  const activeCurrencies = filterActivePersonCurrencies(summary.currencies);

  return (
    <Stack gap="xs" accessibilityLabel={`${personName} balances`}>
      {activeCurrencies.length === 0 ? (
        <Inline gap="sm" alignItems="center" flexWrap="wrap">
          <Badge size="sm" variant="income" icon={Icon.CheckCircle}>
            All settled
          </Badge>
          {fallbackCurrencyCode ? (
            <AppText variant="caption" color="secondary" tabular>
              Net {formatAmount(0, fallbackCurrencyCode)}
            </AppText>
          ) : null}
        </Inline>
      ) : (
        activeCurrencies.map(balance => (
          <Inline
            key={balance.currencyCode}
            gap="sm"
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
          >
            <Stack gap="none" flex={1}>
              {balance.owedToYou !== 0 ? (
                <AppText variant="caption" weight="semibold" color="income" tabular>
                  {`Owes you ${formatAmount(balance.owedToYou, balance.currencyCode)}`}
                </AppText>
              ) : null}
              {balance.youOwe !== 0 ? (
                <AppText variant="caption" weight="semibold" color="expense" tabular>
                  {`You owe ${formatAmount(balance.youOwe, balance.currencyCode)}`}
                </AppText>
              ) : null}
            </Stack>
            <Badge variant={balance.net >= 0 ? 'income' : 'expense'} size="sm">
              {balance.net >= 0 ? '+' : ''}
              {formatAmount(balance.net, balance.currencyCode)}
            </Badge>
          </Inline>
        ))
      )}
    </Stack>
  );
}
