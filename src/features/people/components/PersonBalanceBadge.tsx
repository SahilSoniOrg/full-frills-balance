import { AppText, Badge } from '@/src/components/core';
import { Inline, Stack } from '@/src/design-system';
import type { PersonBalanceSummary } from '@/src/domain/people/personTypes';
import { View } from 'react-native';

type Props = {
  summary: PersonBalanceSummary;
  personName: string;
  compact?: boolean;
  formatAmount?: (amount: number, currencyCode: string) => string;
};

export function PersonBalanceBadge({
  summary,
  personName,
  compact = false,
  formatAmount = (amount, currency) => `${currency} ${amount.toFixed(2)}`,
}: Props) {
  const activeCurrencies = summary.currencies.filter(
    balance => balance.owedToYou !== 0 || balance.youOwe !== 0 || balance.net !== 0,
  );

  return (
    <Stack gap={compact ? 'xs' : 'sm'} accessibilityLabel={`${personName} balances`}>
      {activeCurrencies.length === 0 ? (
        <AppText variant={compact ? 'caption' : 'body'} color="secondary">
          All settled
        </AppText>
      ) : (
        activeCurrencies.map(balance => (
          <View key={balance.currencyCode}>
            <Inline gap="sm" alignItems="center" justifyContent="space-between" flexWrap="wrap">
              <Stack gap="none" flex={1}>
                {balance.owedToYou !== 0 ? (
                  <AppText
                    variant={compact ? 'caption' : 'body'}
                    weight="semibold"
                    color="income"
                    tabular
                  >
                    {compact
                      ? activeCurrencies.length > 1
                        ? `Owes you (${balance.currencyCode})`
                        : 'Owes you'
                      : `${personName} owes you ${formatAmount(balance.owedToYou, balance.currencyCode)}`}
                  </AppText>
                ) : null}
                {balance.youOwe !== 0 ? (
                  <AppText
                    variant={compact ? 'caption' : 'body'}
                    weight="semibold"
                    color="expense"
                    tabular
                  >
                    {compact
                      ? activeCurrencies.length > 1
                        ? `You owe (${balance.currencyCode})`
                        : 'You owe'
                      : `You owe ${personName} ${formatAmount(balance.youOwe, balance.currencyCode)}`}
                  </AppText>
                ) : null}
                {!compact ? (
                  <AppText variant="caption" color="secondary" tabular>
                    Net: {formatAmount(balance.net, balance.currencyCode)}
                  </AppText>
                ) : null}
              </Stack>
              {compact ? (
                <Badge variant={balance.net >= 0 ? 'income' : 'expense'} size="sm">
                  {balance.net >= 0 ? '+' : ''}
                  {formatAmount(balance.net, balance.currencyCode)}
                </Badge>
              ) : null}
            </Inline>
          </View>
        ))
      )}
      {summary.convertedNet?.isInformational && !compact ? (
        <Inline gap="xs" alignItems="center">
          <Badge size="sm">
            Est. net ~{formatAmount(summary.convertedNet.amount, summary.convertedNet.currencyCode)}
          </Badge>
        </Inline>
      ) : null}
    </Stack>
  );
}
