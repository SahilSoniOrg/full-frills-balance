import { AppInput } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { AccountMetadataFormModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface LoanMetadataFieldsProps {
  metadata: AccountMetadataFormModel;
}

export const LoanMetadataFields: React.FC<LoanMetadataFieldsProps> = ({ metadata }) => {
  const {
    emiDay,
    setEmiDay,
    loanTenureMonths,
    setLoanTenureMonths,
    minimumPaymentAmount,
    setMinimumPaymentAmount,
    apr,
    setApr,
  } = metadata;
  return (
    <>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <AppInput
            label="EMI Day"
            value={emiDay}
            onChangeText={setEmiDay}
            placeholder="e.g. 1"
            keyboardType="number-pad"
            maxLength={AppConfig.input.maxDayOfMonthLength}
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppInput
            label="Tenure (Months)"
            value={loanTenureMonths}
            onChangeText={setLoanTenureMonths}
            placeholder="e.g. 36"
            keyboardType="number-pad"
          />
        </View>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 2 }}>
          <AppInput
            label="Monthly EMI"
            value={minimumPaymentAmount}
            onChangeText={setMinimumPaymentAmount}
            placeholder="Enter EMI amount"
            keyboardType="decimal-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppInput
            label="APR (%)"
            value={apr}
            onChangeText={setApr}
            placeholder="e.g. 9.5"
            keyboardType="decimal-pad"
          />
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
});
