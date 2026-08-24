import { AppCard, AppIcon, AppInput, AppText } from '@/src/components/core';
import { CalculatorAmountInput } from '@/src/components/common/CalculatorAmountInput';
import { FilterChipRow } from '@/src/components/common/FilterChipRow';
import { FormSectionGroup } from '@/src/components/common/FormSectionGroup';
import { SelectionTileList } from '@/src/components/common/SelectionTileList';
import { useTheme } from '@/src/hooks/use-theme';
import { SmsRuleFormViewModel } from '../hooks/useSmsRuleFormViewModel';
import { StyleSheet, View } from 'react-native';
import { withOpacity } from '@/src/utils/color-math';
import { Shape, Spacing } from '@/src/constants';

export function MatchModeSection({ vm }: { vm: SmsRuleFormViewModel }) {
  const { theme } = useTheme();
  const {
    mode,
    setMode,
    senderContains,
    setSenderContains,
    accountSourceContains,
    setAccountSourceContains,
    bodyContains,
    setBodyContains,
    merchantContains,
    setMerchantContains,
    currencyCode,
    setCurrencyCode,
    direction,
    setDirection,
    amountOperator,
    setAmountOperator,
    amountValue,
    setAmountValue,
    amountSecondaryValue,
    setAmountSecondaryValue,
    legacySenderMatch,
    setLegacySenderMatch,
    legacyBodyMatch,
    setLegacyBodyMatch,
  } = vm;

  return (
    <FormSectionGroup title="Match Mode">
      <SelectionTileList
        items={[
          { id: 'builder', label: 'Rule Builder', icon: 'sparkles', color: theme.primary },
          { id: 'regex', label: 'Advanced Regex', icon: 'edit', color: theme.warning },
        ]}
        selectedId={mode}
        onSelect={value => setMode((value || 'builder') as 'builder' | 'regex')}
      />

      <AppCard variant="outline" paddingSize="sm" style={styles.panelCard}>
        {mode === 'builder' ? (
          <View style={styles.group}>
            <AppText variant="caption" color="secondary" style={styles.subHelperText}>
              Specify string matching filters. Leave a field blank to ignore it. All populated
              criteria must be satisfied to trigger a match.
            </AppText>

            <View style={styles.inputRow}>
              <View style={styles.inputCol}>
                <AppInput
                  label="Sender Contains"
                  leftIcon="mail"
                  value={senderContains}
                  onChangeText={setSenderContains}
                  placeholder="e.g. HDFCBK"
                  autoCapitalize="characters"
                />
              </View>
              <View style={styles.inputCol}>
                <AppInput
                  label="Account Ref Contains"
                  leftIcon="creditCard"
                  value={accountSourceContains}
                  onChangeText={setAccountSourceContains}
                  placeholder="e.g. 1234 or UPI"
                />
              </View>
            </View>

            <View style={styles.inputRow}>
              <View style={styles.inputCol}>
                <AppInput
                  label="Message Contains"
                  leftIcon="messageSquare"
                  value={bodyContains}
                  onChangeText={setBodyContains}
                  placeholder="e.g. UPI"
                />
              </View>
              <View style={styles.inputCol}>
                <AppInput
                  label="Merchant Contains"
                  leftIcon="tag"
                  value={merchantContains}
                  onChangeText={setMerchantContains}
                  placeholder="e.g. SWIGGY"
                />
              </View>
            </View>

            <View style={styles.inputRow}>
              <View style={styles.inputCol}>
                <AppInput
                  label="Currency Code"
                  leftIcon="transaction"
                  value={currencyCode}
                  onChangeText={setCurrencyCode}
                  autoCapitalize="characters"
                  placeholder="e.g. INR"
                />
              </View>
              <View style={styles.inputCol} />
            </View>

            <AppText variant="caption" weight="medium" style={styles.inlineLabel}>
              Direction
            </AppText>
            <FilterChipRow
              items={[
                {
                  id: 'debit',
                  label: 'Debit (Expense)',
                  icon: 'arrowUp',
                  color: theme.error,
                },
                {
                  id: 'credit',
                  label: 'Credit (Income)',
                  icon: 'arrowDown',
                  color: theme.success,
                },
              ]}
              selectedId={direction}
              onSelect={value => setDirection((value || '') as '' | 'debit' | 'credit')}
            />

            <AppText variant="caption" weight="medium" style={styles.inlineLabel}>
              Amount Filter
            </AppText>
            <FilterChipRow
              items={[
                { id: 'eq', label: 'Equals', color: theme.primary },
                { id: 'gt', label: 'Greater Than', color: theme.primary },
                { id: 'lt', label: 'Less Than', color: theme.primary },
                { id: 'between', label: 'Between', color: theme.primary },
              ]}
              selectedId={amountOperator}
              onSelect={value =>
                setAmountOperator((value || '') as '' | 'eq' | 'gt' | 'lt' | 'between')
              }
            />
            {amountOperator ? (
              amountOperator === 'between' ? (
                <View style={styles.inputRow}>
                  <View style={styles.inputCol}>
                    <CalculatorAmountInput
                      label="Minimum Amount"
                      value={amountValue}
                      onChangeText={setAmountValue}
                      placeholder="0.00"
                    />
                  </View>
                  <View style={styles.inputCol}>
                    <CalculatorAmountInput
                      label="Maximum Amount"
                      value={amountSecondaryValue}
                      onChangeText={setAmountSecondaryValue}
                      placeholder="0.00"
                    />
                  </View>
                </View>
              ) : (
                <CalculatorAmountInput
                  label="Amount"
                  value={amountValue}
                  onChangeText={setAmountValue}
                  placeholder="0.00"
                />
              )
            ) : null}
          </View>
        ) : (
          <View style={styles.group}>
            {/* Warning/Info Callout */}
            <View
              style={[
                styles.alertCallout,
                {
                  borderColor: theme.warning,
                  backgroundColor: withOpacity(theme.warning, 0.05),
                },
              ]}
            >
              <AppIcon name="alert" size={16} color={theme.warning} />
              <AppText variant="caption" color="secondary" style={styles.calloutText}>
                Regular expressions are compiled as case-insensitive, global patterns. Ensure
                special regex syntax characters (e.g. *, +, ?, $) are correctly escaped.
              </AppText>
            </View>

            <AppInput
              label="Sender Match Regex"
              leftIcon="terminal"
              value={legacySenderMatch}
              onChangeText={setLegacySenderMatch}
              placeholder="e.g. SWIGGY|HDFCBK"
            />
            <AppInput
              label="Body Match Regex (Optional)"
              leftIcon="terminal"
              value={legacyBodyMatch}
              onChangeText={setLegacyBodyMatch}
              placeholder="e.g. UPI|\\*\\*1234"
            />
          </View>
        )}
      </AppCard>
    </FormSectionGroup>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.md,
  },
  inlineLabel: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  subHelperText: {
    marginBottom: Spacing.sm,
    lineHeight: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  inputCol: {
    flex: 1,
  },
  panelCard: {
    borderWidth: 1,
    borderRadius: Shape.radius.r3,
    padding: Spacing.md,
  },
  alertCallout: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: Shape.radius.r4,
    borderWidth: 1,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  calloutText: {
    flex: 1,
    lineHeight: 16,
  },
});
