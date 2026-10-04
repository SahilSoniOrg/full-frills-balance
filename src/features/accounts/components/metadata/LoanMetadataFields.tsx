import { AppInput } from '@/src/components/core';
import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { accountFormStrings as copy } from '@/src/constants/copy/domains/accountFormStrings';
import { Spacing } from '@/src/constants/design-tokens';
import type { AccountMetadataFormModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { View } from 'react-native';

export function LoanMetadataFields({
  metadata,
  precision = 2,
}: {
  metadata: AccountMetadataFormModel;
  precision?: number;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: Spacing.lg }}>
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
      <View style={{ borderBottomWidth: 1, borderBottomColor: theme.border }}>
        <AppInput
          variant="minimal"
          label={copy.tenure}
          placeholder={copy.tenurePlaceholder}
          value={metadata.loanTenureMonths}
          onChangeText={metadata.setLoanTenureMonths}
          keyboardType="number-pad"
          testID="account-tenure-input"
        />
      </View>
      <CalculatorAmountInput
        variant="minimal"
        label={copy.emiAmount}
        placeholder={copy.emiAmountPlaceholder}
        value={metadata.minimumPaymentAmount}
        onChangeText={metadata.setMinimumPaymentAmount}
        precision={precision}
        testID="account-emi-amount-input"
      />
    </View>
  );
}
