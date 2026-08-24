import React, { useMemo, useRef, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Keyboard, TextInput } from 'react-native';
import { AppIcon, AppInput, AppText } from '@/src/components/core';
import { Spacing, Shape, Opacity, Size, Typography, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import type { BulkJournalRow, BulkRowFieldValue } from '../types/bulkJournal';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountInlineLabel } from '@/src/components/common/AccountInlineLabel';
import { CalculatorAmountInput } from '@/src/components/common/CalculatorAmountInput';
import { resolveAccountChipColors, type AccountChipColors } from '@/src/utils/accountChipColors';
import dayjs from 'dayjs';

interface BulkEntryRowProps {
  row: BulkJournalRow;
  index: number;
  accounts: AccountFields[];
  onUpdateField: (id: string, field: keyof BulkJournalRow, value: BulkRowFieldValue) => void;
  onRemove: (id: string) => void;
  onDatePickerRequest: (id: string) => void;
  onAccountPickerRequest: (id: string, role: 'source' | 'destination') => void;
  autoFocus?: boolean;
}

export const BulkEntryRow = React.memo(
  ({
    row,
    index,
    accounts,
    onUpdateField,
    onRemove,
    onDatePickerRequest,
    onAccountPickerRequest,
    autoFocus,
  }: BulkEntryRowProps) => {
    const { theme } = useTheme();
    const descriptionRef = useRef<TextInput>(null);

    const sourceAccount = useMemo(
      () => accounts.find(a => a.id === row.sourceId),
      [accounts, row.sourceId],
    );
    const destAccount = useMemo(
      () => accounts.find(a => a.id === row.destinationId),
      [accounts, row.destinationId],
    );

    const sourceCurrency = sourceAccount?.currencyCode;

    const formattedDate = useMemo(() => {
      return dayjs(row.journalDate).format('DD MMM, HH:mm');
    }, [row.journalDate]);

    const getAccountStyles = useCallback(
      (account: AccountFields | undefined, hasConflictError: boolean): AccountChipColors => {
        if (hasConflictError) {
          return {
            bg: 'transparent',
            border: theme.error,
            text: theme.textTertiary,
            icon: theme.textTertiary,
            marker: theme.error,
          };
        }
        return resolveAccountChipColors(account, theme);
      },
      [theme],
    );

    const sourceStyles = useMemo(() => {
      const hasConflict = row.sourceId === row.destinationId && !!row.sourceId;
      return getAccountStyles(sourceAccount, hasConflict);
    }, [sourceAccount, row.sourceId, row.destinationId, getAccountStyles]);

    const destStyles = useMemo(() => {
      const hasConflict = row.sourceId === row.destinationId && !!row.destinationId;
      return getAccountStyles(destAccount, hasConflict);
    }, [destAccount, row.sourceId, row.destinationId, getAccountStyles]);

    return (
      <View style={[styles.container, { borderColor: row.error ? theme.error : theme.border }]}>
        {/* Row 1: # | description | delete */}
        <View style={styles.topRow}>
          <View style={[styles.indexBadge, { backgroundColor: theme.surfaceSecondary }]}>
            <AppText variant="caption" color="secondary" weight="bold">
              #{index + 1}
            </AppText>
          </View>
          <View style={styles.descriptionWrapper}>
            <AppInput
              ref={descriptionRef}
              value={row.description}
              onChangeText={val => onUpdateField(row.id, 'description', val)}
              placeholder="What was this for?"
              variant="minimal"
              style={styles.descriptionInput}
              containerStyle={styles.inputContainer}
              testID={`bulk-description-${row.id}`}
              autoFocus={autoFocus}
            />
          </View>
          <TouchableOpacity
            onPress={() => onRemove(row.id)}
            style={styles.deleteButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <AppIcon name="delete" size={Size.iconXs} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Row 2: date left | amount fills remaining, right-aligned */}
        <View style={styles.metaRow}>
          <TouchableOpacity
            style={[
              styles.dateCell,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
            ]}
            onPress={() => {
              Keyboard.dismiss();
              onDatePickerRequest(row.id);
            }}
          >
            <AppIcon name="calendar" size={12} color={theme.textSecondary} />
            <AppText variant="caption" weight="semibold" style={styles.dateText}>
              {formattedDate}
            </AppText>
          </TouchableOpacity>

          <View
            style={[
              styles.amountWrapper,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
            ]}
          >
            <AppText
              variant="caption"
              weight="bold"
              style={[styles.currencyPrefix, { color: theme.textTertiary }]}
            >
              {sourceCurrency || ''}
            </AppText>
            <CalculatorAmountInput
              value={row.amount}
              onChangeText={val => onUpdateField(row.id, 'amount', val)}
              placeholder="0.00"
              currencySymbol={sourceCurrency || ''}
              testID={`bulk-amount-${row.id}`}
            />
          </View>
        </View>

        {/* Row 3: source | arrow | destination */}
        <View style={styles.accountsRow}>
          <TouchableOpacity
            style={[
              styles.accountChip,
              {
                backgroundColor: sourceStyles.bg,
                borderColor: sourceStyles.border,
              },
            ]}
            onPress={() => {
              Keyboard.dismiss();
              onAccountPickerRequest(row.id, 'source');
            }}
            testID={`bulk-source-${row.id}`}
          >
            <AccountInlineLabel
              account={sourceAccount}
              placeholder="Source"
              variant="caption"
              weight="semibold"
              textColor={sourceStyles.text}
              colors={{ accentColor: sourceStyles.text, categoryColor: sourceStyles.marker }}
            />
            <AppIcon name="chevronDown" size={12} color={sourceStyles.icon} />
          </TouchableOpacity>

          <View style={styles.arrowContainer}>
            <AppIcon name="arrowRight" size={Size.iconXs} color={theme.textTertiary} />
          </View>

          <TouchableOpacity
            style={[
              styles.accountChip,
              {
                backgroundColor: destStyles.bg,
                borderColor: destStyles.border,
              },
            ]}
            onPress={() => {
              Keyboard.dismiss();
              onAccountPickerRequest(row.id, 'destination');
            }}
            testID={`bulk-destination-${row.id}`}
          >
            <AccountInlineLabel
              account={destAccount}
              placeholder="Destination"
              variant="caption"
              weight="semibold"
              textColor={destStyles.text}
              colors={{ accentColor: destStyles.text, categoryColor: destStyles.marker }}
            />
            <AppIcon name="chevronDown" size={12} color={theme.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* FX rate badge (cross-currency only) */}
        {row.isCrossCurrency && (
          <View
            style={[styles.fxBadge, { backgroundColor: withOpacity(theme.primary, Opacity.soft) }]}
          >
            {row.isLoadingRate ? (
              <AppText variant="caption" color="secondary">
                Checking rate...
              </AppText>
            ) : row.exchangeRate ? (
              <AppText variant="caption" color="primary" weight="semibold">
                1 {sourceCurrency} = {parseFloat(row.exchangeRate).toFixed(4)}
                {'  ·  '}
                {row.convertedAmount.toFixed(2)} {destAccount?.currencyCode}
              </AppText>
            ) : null}
          </View>
        )}

        {/* Validation error — shown below all content */}
        {row.error && (
          <View style={[styles.errorBar, { backgroundColor: theme.error + '12' }]}>
            <AppIcon name="error" size={Size.iconXs} color={theme.error} />
            <AppText variant="caption" color="error" weight="semibold" style={styles.errorText}>
              {row.error}
            </AppText>
          </View>
        )}
      </View>
    );
  },
);

BulkEntryRow.displayName = 'BulkEntryRow';

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    borderRadius: Shape.radius.r3,
    borderWidth: 1,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    position: 'relative',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  indexBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Shape.radius.full,
  },
  deleteButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Shape.radius.full,
  },
  descriptionInput: {
    fontSize: Typography.sizes.base,
    paddingHorizontal: 0,
    height: 36,
  },
  descriptionWrapper: {
    flex: 1,
  },
  inputContainer: {
    minHeight: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  dateCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm + 2,
    height: 38,
    borderRadius: Shape.radius.r2,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  dateText: {
    fontSize: Typography.sizes.xs,
  },
  amountWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    borderRadius: Shape.radius.r2,
    borderWidth: 1,
    paddingLeft: Spacing.sm,
  },
  currencyPrefix: {
    fontSize: Typography.sizes.xs,
    marginRight: Spacing.xs,
  },
  amountInput: {
    fontSize: Typography.sizes.base,
    height: 36,
    textAlign: 'right',
    flex: 1,
    paddingRight: Spacing.sm,
  },
  accountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  accountChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    borderRadius: Shape.radius.r2,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  accountLabel: {
    flex: 1,
    fontSize: Typography.sizes.sm,
  },
  accountLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  archivedIndicatorSpacer: {
    marginRight: Spacing.xs,
  },
  arrowContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fxBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Shape.radius.r2,
    alignSelf: 'flex-start',
  },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Shape.radius.r2,
  },
  errorText: {
    flex: 1,
  },
});
