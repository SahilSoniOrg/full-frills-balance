import { FormSelectorField } from '@/src/components/common/FormSelectorField';
import { SectionLabel } from '@/src/components/common/SectionLabel';
import { AppInput, AppText } from '@/src/components/core';
import { AppSegmentedControl } from '@/src/components/core/AppSegmentedControl';
import { Spacing } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { AccountMetadataFormModel } from '@/src/features/accounts/hooks/useAccountFormViewModel';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface CreditCardMetadataFieldsProps {
  metadata: AccountMetadataFormModel;
}

export const CreditCardMetadataFields: React.FC<CreditCardMetadataFieldsProps> = ({ metadata }) => {
  const {
    statementDay,
    setStatementDay,
    dueDay,
    setDueDay,
    creditLimitAmount,
    setCreditLimitAmount,
    apr,
    setApr,
    payFromAccountName,
    setPayFromAccountId,
    setIsPayFromPickerVisible,
    isMinPaymentOnly,
    setIsMinPaymentOnly,
    minimumPaymentAmount,
    setMinimumPaymentAmount,
    minimumPaymentPercent,
    setMinimumPaymentPercent,
  } = metadata;

  return (
    <>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <AppInput
            label="Statement Day"
            value={statementDay}
            onChangeText={setStatementDay}
            placeholder="e.g. 15"
            keyboardType="number-pad"
            maxLength={AppConfig.input.maxDayOfMonthLength}
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppInput
            label="Due Day"
            value={dueDay}
            onChangeText={setDueDay}
            placeholder="e.g. 5"
            keyboardType="number-pad"
            maxLength={AppConfig.input.maxDayOfMonthLength}
          />
        </View>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 2 }}>
          <AppInput
            label="Credit Limit"
            value={creditLimitAmount}
            onChangeText={setCreditLimitAmount}
            placeholder="Enter credit limit"
            keyboardType="decimal-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppInput
            label="APR (%)"
            value={apr}
            onChangeText={setApr}
            placeholder="e.g. 15.5"
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <SectionLabel label="Simulation Settings" />

      <View style={styles.fieldGroup}>
        <AppText variant="body" weight="medium" style={styles.label}>
          Repayment Simulation
        </AppText>
        <AppSegmentedControl
          flex
          options={[
            { id: 'FULL', label: 'Full Statement' },
            { id: 'MIN', label: 'Minimum Payment' },
          ]}
          value={isMinPaymentOnly ? 'MIN' : 'FULL'}
          onChange={id => setIsMinPaymentOnly(id === 'MIN')}
        />
        <AppText variant="caption" color="secondary" style={styles.helpText}>
          Controls how much outflow is projected per cycle.
        </AppText>
      </View>

      {isMinPaymentOnly && (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <AppInput
              label="Min Amount"
              value={minimumPaymentAmount}
              onChangeText={setMinimumPaymentAmount}
              placeholder="e.g. 500"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppInput
              label="Min Percent (%)"
              value={minimumPaymentPercent}
              onChangeText={setMinimumPaymentPercent}
              placeholder="e.g. 5"
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      )}

      {isMinPaymentOnly && (
        <AppText variant="caption" color="secondary" style={styles.infoBox}>
          Simulation will use the higher of the absolute amount or percentage.
        </AppText>
      )}

      <FormSelectorField
        label={AppConfig.strings.accounts.form.payDebtFrom}
        value={payFromAccountName !== AppConfig.strings.common.none ? payFromAccountName : ''}
        placeholder={AppConfig.strings.common.none}
        onPress={() => setIsPayFromPickerVisible(true)}
        onClear={
          payFromAccountName !== AppConfig.strings.common.none
            ? () => setPayFromAccountId('')
            : undefined
        }
      />
    </>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  label: {
    marginBottom: Spacing.xs,
  },
  simulationHeader: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  simulationTitle: {
    fontSize: 11,
    letterSpacing: 1.2,
  },
  fieldGroup: {
    marginBottom: Spacing.md,
  },
  helpText: {
    marginTop: Spacing.xs,
  },
  infoBox: {
    marginTop: -Spacing.xs,
    marginBottom: Spacing.md,
    fontStyle: 'italic',
  },
});
