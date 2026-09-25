import { InfoSheet } from '@/src/components/overlays/InfoSheet';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import type { UnvaluedStartingBalance } from '@/src/services/simulation/types';
import { View } from 'react-native';

interface SafeToSpendIncompleteDataModalProps {
  visible: boolean;
  onClose: () => void;
  currencyCode: string;
  unvaluedStartingBalances: UnvaluedStartingBalance[];
}

export function SafeToSpendIncompleteDataModal({
  visible,
  onClose,
  currencyCode,
  unvaluedStartingBalances,
}: SafeToSpendIncompleteDataModalProps) {
  const formatMoney = useMoneyFormat();
  const copy = AppConfig.strings.dashboard.safeToSpendUi;

  return (
    <InfoSheet
      visible={visible}
      title={copy.incompleteFxDetailsTitle}
      onClose={onClose}
      accessibilityCloseLabel="Close incomplete Safe to Spend details"
      useNativeModal={false}
    >
      <View style={{ gap: Spacing.lg }}>
        <AppText variant="body" color="secondary">
          {copy.incompleteFxDetailsIntro(currencyCode)}
        </AppText>
        {unvaluedStartingBalances.length > 0 ? (
          <View style={{ gap: Spacing.md }}>
            <AppText variant="subheading" weight="bold">
              {copy.excludedStartingBalancesTitle}
            </AppText>
            {unvaluedStartingBalances.map(balance => (
              <View key={balance.accountId} style={{ gap: Spacing.xs }}>
                <AppText variant="body" weight="medium">
                  {copy.excludedStartingBalance(
                    balance.accountName,
                    formatMoney(balance.amount, balance.fromCurrency),
                  )}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {copy.missingCurrentExchangeRate(balance.fromCurrency, balance.toCurrency)}
                </AppText>
              </View>
            ))}
          </View>
        ) : (
          <AppText variant="body" color="secondary">
            {copy.incompleteFxUnidentifiedItems}
          </AppText>
        )}
      </View>
    </InfoSheet>
  );
}
