import { AppIcon, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { TransactionType } from '@/src/data/models/Transaction';
import { useWorkplaceCurrency } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import { JournalEntryLine } from '@/src/types/domain';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalLineItemProps {
  line: JournalEntryLine;
  index: number;
  canRemove: boolean;
  onUpdate: <K extends keyof JournalEntryLine>(field: K, value: JournalEntryLine[K]) => void;
  onRemove: () => void;
  onSelectAccount: () => void;
  onAutoFetchRate?: () => void;
  onBalanceLine?: () => void;
  getLineBaseAmount: (line: JournalEntryLine, baseCurrency: string) => number;
}

export const JournalLineItem = React.memo(
  ({
    line,
    canRemove,
    onUpdate,
    onRemove,
    onSelectAccount,
    onAutoFetchRate,
    onBalanceLine,
    getLineBaseAmount,
  }: JournalLineItemProps) => {
    const { theme } = useTheme();
    const workplaceCurrency = useWorkplaceCurrency();

    return (
      <View style={styles.container}>
        <View style={styles.mainRow}>
          {/* Account Selector - Flat and clean */}
          <TouchableOpacity
            style={[
              styles.accountSelector,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
            ]}
            onPress={onSelectAccount}
          >
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <AppText variant="caption" color="tertiary" weight="bold" style={styles.fieldLabel}>
                ACCOUNT
              </AppText>
              <AppText variant="body" weight="semibold" numberOfLines={1}>
                {line.accountName || AppConfig.strings.advancedEntry.selectAccount}
              </AppText>
            </View>
            <AppIcon name="chevronDown" size={14} color={theme.textTertiary} />
          </TouchableOpacity>

          {/* Amount Input - Prominent but integrated */}
          <View
            style={[
              styles.amountInputWrapper,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
            ]}
          >
            <View style={{ flex: 1, paddingLeft: Spacing.md }}>
              <AppText variant="caption" color="tertiary" weight="bold" style={styles.fieldLabel}>
                {line.accountCurrency || workplaceCurrency}
              </AppText>
              <AppInput
                value={line.amount}
                onChangeText={(value: string) => onUpdate('amount', value)}
                placeholder="0.00"
                keyboardType="numeric"
                style={styles.amountInput}
                variant="minimal"
                containerStyle={{ minHeight: 0, marginTop: -4 }}
                testID={`amount-input-${line.id}`}
              />
            </View>
          </View>
        </View>

        <View style={styles.secondaryRow}>
          {/* DR/CR Toggle - Modern Segmented Style */}
          <View
            style={[
              styles.typeSelector,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.typeSegment,
                line.transactionType === TransactionType.DEBIT && {
                  backgroundColor: theme.primary,
                },
              ]}
              onPress={() => onUpdate('transactionType', TransactionType.DEBIT)}
            >
              <AppText
                variant="caption"
                weight="bold"
                style={{
                  color:
                    line.transactionType === TransactionType.DEBIT
                      ? theme.pureInverse
                      : theme.textSecondary,
                }}
              >
                DR
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeSegment,
                line.transactionType === TransactionType.CREDIT && {
                  backgroundColor: theme.primary,
                },
              ]}
              onPress={() => onUpdate('transactionType', TransactionType.CREDIT)}
            >
              <AppText
                variant="caption"
                weight="bold"
                style={{
                  color:
                    line.transactionType === TransactionType.CREDIT
                      ? theme.pureInverse
                      : theme.textSecondary,
                }}
              >
                CR
              </AppText>
            </TouchableOpacity>
          </View>

          {/* Notes Input */}
          <View style={{ flex: 1 }}>
            <AppInput
              value={line.notes}
              onChangeText={(value: string) => onUpdate('notes', value)}
              placeholder={AppConfig.strings.advancedEntry.notesPlaceholder}
              variant="minimal"
              containerStyle={{
                height: 44,
                backgroundColor: theme.surfaceSecondary,
                borderRadius: Shape.radius.r2,
                paddingHorizontal: Spacing.sm,
              }}
              style={{ fontSize: 14 }}
            />
          </View>

          {canRemove && (
            <TouchableOpacity
              onPress={onRemove}
              style={[
                styles.removeButton,
                { backgroundColor: withOpacity(theme.error, Opacity.soft) },
              ]}
            >
              <AppIcon name="delete" size={Size.iconXs} color={theme.error} />
            </TouchableOpacity>
          )}
        </View>

        {/* Exchange Rate (Conditional) */}
        {line.accountCurrency && line.accountCurrency !== workplaceCurrency && (
          <View
            style={[
              styles.exchangeRateRow,
              { backgroundColor: withOpacity(theme.primary, Opacity.soft) },
            ]}
          >
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
              <AppIcon name="refresh" size={12} color={theme.primary} />
              <AppText variant="caption" color="primary" weight="medium">
                ≈{' '}
                {CurrencyFormatter.format(
                  getLineBaseAmount(line, workplaceCurrency),
                  workplaceCurrency,
                )}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <AppText variant="caption" color="secondary">
                Rate:
              </AppText>
              <AppInput
                value={line.exchangeRate || ''}
                onChangeText={(value: string) => onUpdate('exchangeRate', value)}
                placeholder="1.0"
                keyboardType="decimal-pad"
                variant="minimal"
                containerStyle={{ width: 60, minHeight: 0 }}
                style={{ fontSize: 13, textAlign: 'right', fontWeight: 'bold' }}
              />
              <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                {onBalanceLine && (
                  <TouchableOpacity onPress={onBalanceLine} style={styles.fetchButton}>
                    <AppText variant="caption" color="primary" weight="bold">
                      Balance
                    </AppText>
                  </TouchableOpacity>
                )}
                {onAutoFetchRate && (
                  <TouchableOpacity onPress={onAutoFetchRate} style={styles.fetchButton}>
                    <AppText variant="caption" color="secondary" weight="bold">
                      Fetch
                    </AppText>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: theme.divider }]} />
      </View>
    );
  },
);

JournalLineItem.displayName = 'JournalLineItem';

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  mainRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  accountSelector: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderRadius: Shape.radius.r3,
    height: 60,
  },
  fieldLabel: {
    fontSize: 9,
    marginBottom: 0,
    letterSpacing: 1,
    opacity: 0.7,
  },
  amountInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Shape.radius.r3,
    height: 60,
    overflow: 'hidden',
  },
  amountInput: {
    textAlign: 'right',
    fontSize: 18,
    fontWeight: '700',
    paddingRight: Spacing.md,
    minHeight: 0,
  },
  typeSelector: {
    flexDirection: 'row',
    height: 44,
    borderRadius: Shape.radius.r2,
    padding: 3,
    borderWidth: 1,
    alignItems: 'center',
  },
  typeSegment: {
    width: 40,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Shape.radius.r2 - 2,
  },
  removeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Shape.radius.r2,
  },
  exchangeRateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.r2,
    marginTop: 0,
  },
  fetchButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  divider: {
    height: 1,
    width: '100%',
    marginTop: Spacing.md,
    opacity: Opacity.muted,
  },
});
