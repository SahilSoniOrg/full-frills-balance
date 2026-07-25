import { AppButton, AppIcon, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { AccountTileList } from '@/src/features/journal/components/AccountTileList';
import { SplitJournalEditor } from '@/src/features/journal/entry/hooks/useSplitJournalEditor';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type SplitFormProps = SplitJournalEditor;

export function SplitForm({
  sourceAccountId,
  setSourceAccountId,
  totalAmount,
  setTotalAmount,
  splits,
  addSplitRow,
  removeSplitRow,
  updateSplitRow,
  totals,
  validationError,
  transactionAccounts,
  expenseAccounts,
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

  return (
    <View style={styles.container}>
      <AccountTileList
        title={str.fromAccount}
        accounts={transactionAccounts}
        selectedId={sourceAccountId}
        onSelect={setSourceAccountId}
        onSearchRequest={openSourceAccountPicker}
      />

      <View style={styles.totalSection}>
        <AppText variant="caption" color="secondary" weight="semibold">
          {str.totalAmount}
        </AppText>
        <AppInput
          value={totalAmount}
          onChangeText={setTotalAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          containerStyle={styles.totalInput}
        />
      </View>

      <View style={styles.splitHeader}>
        <AppText variant="body" weight="bold">
          {str.categoriesTitle}
        </AppText>
        <AppButton variant="ghost" size="sm" onPress={addSplitRow}>
          {str.addSplit}
        </AppButton>
      </View>

      {splits.map((row, index) => (
        <View
          key={row.id}
          style={[styles.splitRow, { borderColor: theme.border, backgroundColor: theme.surface }]}
        >
          <View style={styles.splitRowTop}>
            <AppText variant="caption" color="secondary" weight="bold">
              {str.splitLabel(index + 1)}
            </AppText>
            {splits.length > 2 && (
              <TouchableOpacity
                onPress={() => removeSplitRow(row.id)}
                accessibilityLabel={str.removeSplit}
                hitSlop={Spacing.sm}
              >
                <AppIcon name="delete" size={Size.iconSm} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <AccountTileList
            title={str.category}
            accounts={expenseAccounts}
            selectedId={row.accountId}
            onSelect={accountId => updateSplitRow(row.id, { accountId })}
            onSearchRequest={() => openSplitAccountPicker(row.id)}
          />

          <AppInput
            value={row.amount}
            onChangeText={amount => updateSplitRow(row.id, { amount })}
            keyboardType="decimal-pad"
            placeholder={str.amountPlaceholder}
            label={str.amount}
          />
        </View>
      ))}

      <View style={[styles.remainingPill, { backgroundColor: theme.surfaceSecondary }]}>
        <AppText variant="body" weight="semibold" style={{ color: remainingColor }}>
          {remainingLabel}
        </AppText>
      </View>

      {validationMessage && totals.total > 0 && (
        <AppText variant="caption" color="error" style={{ opacity: Opacity.muted }}>
          {validationMessage}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  totalSection: {
    gap: Spacing.xs,
  },
  totalInput: {
    marginBottom: 0,
  },
  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  splitRow: {
    borderWidth: 1,
    borderRadius: Shape.radius.r2,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  splitRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  remainingPill: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Shape.radius.r2,
    alignItems: 'center',
  },
});
