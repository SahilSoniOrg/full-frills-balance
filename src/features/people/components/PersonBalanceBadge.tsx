import { AppText, Badge } from '@/src/components/core';
import type { PersonBalanceSummary } from '@/src/domain/people/personTypes';
import { View } from 'react-native';

type Props = {
  summary: PersonBalanceSummary;
  personName: string;
  formatAmount?: (amount: number, currencyCode: string) => string;
};
export function PersonBalanceBadge({
  summary,
  personName,
  formatAmount = (amount, currency) => `${currency} ${amount.toFixed(2)}`,
}: Props) {
  return (
    <View accessibilityLabel={`${personName} balances`}>
      {summary.currencies.map(balance => (
        <View key={balance.currencyCode}>
          {balance.owedToYou !== 0 && (
            <AppText>
              {personName} owes you {formatAmount(balance.owedToYou, balance.currencyCode)}
            </AppText>
          )}
          {balance.youOwe !== 0 && (
            <AppText>
              You owe {personName} {formatAmount(balance.youOwe, balance.currencyCode)}
            </AppText>
          )}
          <AppText>Net: {formatAmount(balance.net, balance.currencyCode)}</AppText>
        </View>
      ))}
      {summary.convertedNet?.isInformational && (
        <Badge size="sm">
          <AppText>
            Est. net ~{formatAmount(summary.convertedNet.amount, summary.convertedNet.currencyCode)}
          </AppText>
        </Badge>
      )}
    </View>
  );
}
