import { AppInput, AppText, IvyIcon } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface CreditCardMetadataFieldsProps {
  statementDay: string;
  setStatementDay: (value: string) => void;
  dueDay: string;
  setDueDay: (value: string) => void;
  creditLimitAmount: string;
  setCreditLimitAmount: (value: string) => void;
  apr: string;
  setApr: (value: string) => void;
  payFromAccountName: string;
  setPayFromAccountId: (value: string) => void;
  setIsPayFromPickerVisible: (visible: boolean) => void;
}

export const CreditCardMetadataFields: React.FC<CreditCardMetadataFieldsProps> = ({
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
}) => {
  const { theme } = useTheme();

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
      <View>
        <AppText variant="body" weight="medium" style={styles.label}>
          {AppConfig.strings.accounts.form.payDebtFrom}
        </AppText>
        <TouchableOpacity
          onPress={() => setIsPayFromPickerVisible(true)}
          style={[
            styles.selectorButton,
            { borderColor: theme.border, backgroundColor: theme.surface },
          ]}
        >
          <AppText
            variant="body"
            style={{
              color:
                payFromAccountName !== AppConfig.strings.common.none
                  ? theme.text
                  : theme.textSecondary,
            }}
          >
            {payFromAccountName}
          </AppText>
          <View style={styles.selectorActions}>
            {payFromAccountName !== AppConfig.strings.common.none && (
              <TouchableOpacity
                onPress={e => {
                  e.stopPropagation();
                  setPayFromAccountId('');
                }}
                style={[
                  styles.clearButton,
                  { backgroundColor: withOpacity(theme.text, Opacity.hover) },
                ]}
              >
                <AppText variant="caption" color="secondary">
                  {AppConfig.strings.accounts.form.clear}
                </AppText>
              </TouchableOpacity>
            )}
            <IvyIcon name="chevronDown" size={Size.iconSm} color={theme.textSecondary} />
          </View>
        </TouchableOpacity>
      </View>
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
  selectorButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Shape.radius.sm,
    borderWidth: 1,
    minHeight: Size.touchTarget,
  },
  selectorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  clearButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Shape.radius.xs,
  },
});
