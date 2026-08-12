import { AccountInlineLabel } from '@/src/components/common/AccountInlineLabel';
import { AppIcon, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Size, Spacing, Typography } from '@/src/constants';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { Theme } from '@/src/constants/design-tokens';
import Account from '@/src/data/models/Account';
import { SplitJournalController } from '@/src/features/journal/entry/modes/split/splitJournalState';
import { useTheme } from '@/src/hooks/use-theme';
import { resolveAccountChipColors } from '@/src/utils/accountChipColors';
import React, { useCallback } from 'react';
import {
  Keyboard,
  Pressable,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

type SplitFormProps = SplitJournalController;

const AMOUNT_COL_WIDTH = 116;
const DELETE_COL_WIDTH = 28;

function accountChipStyles(account: Account | undefined, theme: Theme) {
  return resolveAccountChipColors(account, theme);
}

interface SplitRowItemProps {
  row: SplitJournalController['splits'][number];
  index: number;
  isLast: boolean;
  canRemove: boolean;
  categoryAccount?: Account;
  theme: Theme;
  str: typeof AppConfig.strings.transactionFlow.splitEntry;
  hairlineStyle: StyleProp<ViewStyle>;
  onOpenPicker: (id: string) => void;
  onUpdateAmount: (id: string, amount: string) => void;
  onRemoveRow: (id: string) => void;
}

const SplitRowItem = React.memo(function SplitRowItem({
  row,
  index,
  isLast,
  canRemove,
  categoryAccount,
  theme,
  str,
  hairlineStyle,
  onOpenPicker,
  onUpdateAmount,
  onRemoveRow,
}: SplitRowItemProps) {
  const categoryStyles = accountChipStyles(categoryAccount, theme);

  return (
    <View style={[styles.gridRow, !isLast && hairlineStyle]}>
      <View style={styles.categoryCellWrap}>
        <Pressable
          style={({ pressed }) => [styles.categoryCell, pressed && styles.categoryCellPressed]}
          onPress={() => {
            Keyboard.dismiss();
            onOpenPicker(row.id);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${str.category}: ${categoryAccount?.name ?? 'Choose category'}`}
        >
          <View style={styles.categoryCellInner} pointerEvents="none">
            <AccountInlineLabel
              account={categoryAccount}
              placeholder="Choose category"
              variant="caption"
              weight={categoryAccount ? 'semibold' : 'medium'}
              textColor={categoryAccount ? categoryStyles.text : theme.textTertiary}
              colors={{ accentColor: categoryStyles.text, categoryColor: categoryStyles.marker }}
            />
            <AppIcon
              name="chevronDown"
              size={12}
              color={categoryAccount ? categoryStyles.icon : theme.textTertiary}
              style={styles.categoryChevron}
            />
          </View>
        </Pressable>
      </View>

      <View style={styles.amountCell}>
        <View style={[styles.amountInputWrap, hairlineStyle]}>
          <AppInput
            value={row.amount}
            onChangeText={amount => onUpdateAmount(row.id, amount)}
            keyboardType="decimal-pad"
            placeholder={str.amountPlaceholder}
            accessibilityLabel={`${str.category} ${index + 1} ${str.amount}`}
            variant="minimal"
            inputStyle={[styles.splitAmountInput, { color: theme.text }]}
            containerStyle={styles.splitAmountContainer}
          />
        </View>
      </View>

      <TouchableOpacity
        onPress={() => canRemove && onRemoveRow(row.id)}
        disabled={!canRemove}
        accessibilityLabel={str.removeSplit}
        accessibilityState={{ disabled: !canRemove }}
        style={styles.deleteCol}
        hitSlop={Spacing.sm}
      >
        <AppIcon
          name="delete"
          size={Size.iconXs}
          color={canRemove ? theme.textSecondary : 'transparent'}
        />
      </TouchableOpacity>
    </View>
  );
});

export function SplitForm({
  totalAmount,
  setTotalAmount,
  splits,
  addSplitRow,
  removeSplitRow,
  updateSplitRow,
  totals,
  validationError,
  expenseAccounts,
  sourceAccount,
  displayCurrency,
  openSourceAccountPicker,
  openSplitAccountPicker,
}: SplitFormProps) {
  const { theme } = useTheme();
  const str = AppConfig.strings.transactionFlow.splitEntry;

  const remainingLabel =
    totals.remaining === 0
      ? str.remainingZero
      : totals.remaining > 0
        ? str.remainingPositive(totals.remaining.toFixed(2))
        : str.remainingNegative(Math.abs(totals.remaining).toFixed(2));

  const remainingColor =
    totals.remaining === 0
      ? theme.primary
      : totals.remaining > 0
        ? theme.textSecondary
        : theme.error;

  const validationMessage = validationError ? str.validation[validationError] : null;
  const sourceStyles = accountChipStyles(sourceAccount, theme);
  const hairline = { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth };
  const isFullyAllocated = totals.total > 0 && totals.remaining === 0;
  const showAllocationStatus = totals.total > 0;
  const hasSource = !!sourceAccount;
  const canRemove = splits.length > 2;
  const currencySymbol = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency;

  const handleUpdateAmount = useCallback(
    (id: string, amount: string) => {
      updateSplitRow(id, { amount });
    },
    [updateSplitRow],
  );

  return (
    <View style={styles.container}>
      <View style={styles.paymentSection}>
        <View style={styles.sectionHeader}>
          <AppText variant="body" weight="semibold" color="primary" style={styles.sectionTitle}>
            {str.fromAccount}
          </AppText>
          <AppText
            variant="caption"
            color="tertiary"
            weight="medium"
            style={styles.amountHeaderLabel}
          >
            {str.totalAmount}
          </AppText>
          <View style={styles.deleteCol} />
        </View>
        <View style={styles.gridRow}>
          <View style={styles.categoryCellWrap}>
            <Pressable
              style={({ pressed }) => [styles.categoryCell, pressed && styles.categoryCellPressed]}
              onPress={() => {
                Keyboard.dismiss();
                openSourceAccountPicker();
              }}
              accessibilityRole="button"
              accessibilityLabel={str.fromAccount}
            >
              <View style={styles.categoryCellInner} pointerEvents="none">
                <AccountInlineLabel
                  account={sourceAccount}
                  placeholder="Select account"
                  variant="body"
                  weight="semibold"
                  textColor={hasSource ? sourceStyles.text : theme.textSecondary}
                  colors={{ accentColor: sourceStyles.text, categoryColor: sourceStyles.marker }}
                />
                <AppIcon
                  name="chevronDown"
                  size={12}
                  color={sourceStyles.icon}
                  style={styles.categoryChevron}
                />
              </View>
            </Pressable>
          </View>

          <View style={styles.amountCell}>
            <View style={[styles.amountInputWrap, hairline]}>
              <View style={styles.amountInputInner}>
                <AppText
                  variant="body"
                  weight="semibold"
                  style={[styles.totalCurrencySymbol, { color: theme.textTertiary }]}
                >
                  {currencySymbol}
                </AppText>
                <AppInput
                  value={totalAmount}
                  onChangeText={setTotalAmount}
                  keyboardType="decimal-pad"
                  placeholder={str.amountPlaceholder}
                  accessibilityLabel={str.totalAmount}
                  variant="minimal"
                  inputStyle={[styles.totalAmountInput, { color: theme.text }]}
                  containerStyle={styles.totalAmountContainer}
                />
              </View>
            </View>
          </View>
          <View style={styles.deleteCol} />
        </View>
      </View>

      <View style={[styles.sectionRule, { borderBottomColor: theme.border }]} />

      <View style={styles.categoriesSection}>
        <View style={styles.sectionHeader}>
          <AppText variant="body" weight="semibold" color="primary" style={styles.sectionTitle}>
            {str.categoriesTitle}
          </AppText>
          {showAllocationStatus &&
            (isFullyAllocated ? (
              <View
                style={styles.allocatedBadge}
                accessibilityLabel={str.remainingZero}
                accessibilityRole="text"
              >
                <AppIcon name="checkCircle" size={Size.iconXs} color={theme.primary} />
              </View>
            ) : (
              <AppText
                variant="caption"
                color="tertiary"
                weight="medium"
                numberOfLines={1}
                style={{ color: remainingColor }}
              >
                {remainingLabel}
              </AppText>
            ))}
        </View>

        {splits.map((row, index) => {
          const category = expenseAccounts.find(a => a.id === row.accountId);
          const isLast = index === splits.length - 1;

          return (
            <SplitRowItem
              key={row.id}
              row={row}
              index={index}
              isLast={isLast}
              canRemove={canRemove}
              categoryAccount={category}
              theme={theme}
              str={str}
              hairlineStyle={hairline}
              onOpenPicker={openSplitAccountPicker}
              onUpdateAmount={handleUpdateAmount}
              onRemoveRow={removeSplitRow}
            />
          );
        })}

        {validationMessage && totals.total > 0 && (
          <View style={styles.errorRow}>
            <AppIcon name="error" size={Size.iconXs} color={theme.error} />
            <AppText variant="caption" color="error" weight="semibold" style={styles.errorText}>
              {validationMessage}
            </AppText>
          </View>
        )}

        <TouchableOpacity onPress={addSplitRow} style={styles.addSplitLink} hitSlop={Spacing.sm}>
          <AppText variant="caption" color="primary" weight="semibold">
            + {str.addSplit}
          </AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
  },
  paymentSection: {
    paddingBottom: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  sectionTitle: {
    flex: 1,
  },
  amountHeaderLabel: {
    width: AMOUNT_COL_WIDTH,
    textAlign: 'right',
  },
  sectionRule: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.md,
  },
  categoriesSection: {
    marginTop: Spacing.xs,
  },
  allocatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingVertical: 2,
  },
  categoryCellWrap: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  deleteCol: {
    width: DELETE_COL_WIDTH,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  categoryCell: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.sm,
    paddingVertical: Spacing.xs,
    minHeight: 36,
  },
  categoryCellPressed: {
    opacity: 0.7,
  },
  categoryCellInner: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    minWidth: 0,
  },
  sourceAccountLabel: {
    flexShrink: 1,
    fontSize: Typography.sizes.base,
  },
  splitCategoryLabel: {
    flexShrink: 1,
    fontSize: Typography.sizes.sm,
  },
  categoryChevron: {
    marginLeft: Spacing.xs,
    flexShrink: 0,
  },
  archivedIndicatorSpacer: {
    marginRight: Spacing.xs,
  },
  amountCell: {
    width: AMOUNT_COL_WIDTH,
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amountInputWrap: {
    width: AMOUNT_COL_WIDTH,
    paddingBottom: 2,
    justifyContent: 'center',
  },
  amountInputInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    gap: 2,
  },
  totalAmountContainer: {
    flex: 1,
    minWidth: 0,
    minHeight: 26,
  },
  splitAmountContainer: {
    width: '100%',
    minHeight: 26,
  },
  totalAmountInput: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    height: 28,
    textAlign: 'right',
    paddingHorizontal: 0,
    width: '100%',
  },
  totalCurrencySymbol: {
    fontSize: Typography.sizes.base,
    lineHeight: 28,
  },
  splitAmountInput: {
    fontSize: Typography.sizes.sm,
    fontWeight: '500',
    height: 28,
    textAlign: 'right',
    paddingHorizontal: 0,
    width: '100%',
  },
  addSplitLink: {
    alignSelf: 'flex-start',
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  errorText: {
    flex: 1,
  },
});
