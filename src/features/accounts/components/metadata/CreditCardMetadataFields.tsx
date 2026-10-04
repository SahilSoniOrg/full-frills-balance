import { AppInput, AppText } from '@/src/components/core';
import { AppTabs } from '@/src/components/core/AppTabs';
import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { accountFormStrings as copy } from '@/src/constants/copy/domains/accountFormStrings';
import { Spacing } from '@/src/constants/design-tokens';
import type { AccountMetadataFormModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { View } from 'react-native';

export function CreditCardMetadataFields({
  metadata,
  precision = 2,
}: {
  metadata: AccountMetadataFormModel;
  precision?: number;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: Spacing.lg }}>
      <CalculatorAmountInput
        variant="minimal"
        label={copy.creditLimit}
        placeholder={copy.creditLimitPlaceholder}
        value={metadata.creditLimitAmount}
        onChangeText={metadata.setCreditLimitAmount}
        precision={precision}
        testID="account-credit-limit-input"
      />
      <View style={{ borderBottomWidth: 1, borderBottomColor: theme.border }}>
        <AppInput
          variant="minimal"
          label={copy.apr}
          placeholder={copy.aprPlaceholder}
          value={metadata.apr}
          onChangeText={metadata.setApr}
          keyboardType="decimal-pad"
          testID="account-apr-input"
        />
      </View>
      <AppText variant="body" weight="medium">
        {copy.repayment}
      </AppText>
      <AppTabs
        options={[
          { id: 'FULL', label: copy.payInFull },
          { id: 'MIN', label: copy.minimumOnly },
        ]}
        value={metadata.isMinPaymentOnly ? 'MIN' : 'FULL'}
        onChange={id => metadata.setIsMinPaymentOnly(id === 'MIN')}
        testID="account-repayment-tabs"
      />
      <AppText variant="caption" color="secondary">
        {copy.repaymentHelp}
      </AppText>
      <CalculatorAmountInput
        variant="minimal"
        label={copy.minAmount}
        placeholder={copy.minAmountPlaceholder}
        value={metadata.minimumPaymentAmount}
        onChangeText={metadata.setMinimumPaymentAmount}
        precision={precision}
        testID="account-minimum-amount-input"
      />
      <View style={{ borderBottomWidth: 1, borderBottomColor: theme.border }}>
        <AppInput
          variant="minimal"
          label={copy.minPercent}
          placeholder={copy.minPercentPlaceholder}
          value={metadata.minimumPaymentPercent}
          onChangeText={metadata.setMinimumPaymentPercent}
          keyboardType="decimal-pad"
          testID="account-minimum-percent-input"
        />
      </View>
      <AppText variant="caption" color="secondary">
        {copy.minimumHelp}
      </AppText>
    </View>
  );
}
