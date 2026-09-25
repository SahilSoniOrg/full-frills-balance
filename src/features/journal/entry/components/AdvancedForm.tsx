import type { CreateAccountIntent } from '@/src/components/account-selection';
import { AppIcon, AppText, Icon, PressScaleTouchable } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { SplitAllocationRow } from '@/src/features/journal/entry/components/SplitAllocationRow';
import type { AdvancedJournalFormController } from '@/src/features/journal/entry/hooks/useAdvancedJournalForm';
import type { AccountRole, JournalEntryLine } from '@/src/types/domainJournal';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { useTheme } from '@/src/hooks/use-theme';
import { withOpacity } from '@/src/utils/color-math';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

type Side = 'from' | 'to';

export function AdvancedForm({
  showLineNotes = false,
  fromLines,
  toLines,
  rowFx,
  accounts,
  fromTotal,
  toTotal,
  remaining,
  isBalanced,
  canEqualize,
  canDistribute,
  workplaceCurrency,
  addFromLine,
  addToLine,
  removeLine,
  canRemoveFrom,
  canRemoveTo,
  selectAccount,
  updateAmount,
  updateNotes,
  updateConvertedAmount,
  resetRate,
  equalizeToLines,
  distributeToLines,
  moveLine,
  onCreateAccountRequestForRow,
}: AdvancedJournalFormController & {
  showLineNotes?: boolean;
  onCreateAccountRequestForRow: (
    rowId: string,
    role: AccountRole,
    intent: CreateAccountIntent,
  ) => void;
}) {
  const { theme } = useTheme();
  const strings = AppConfig.strings.advancedEntry;
  const splitStrings = AppConfig.strings.transactionFlow.splitEntry;
  const [activePickerKey, setActivePickerKey] = useState<string | null>(null);
  const hasAmounts = fromTotal > 0 || toTotal > 0;
  const formattedRemaining = CurrencyFormatter.format(Math.abs(remaining), workplaceCurrency);
  const statusLabel = !hasAmounts
    ? null
    : isBalanced
      ? splitStrings.remainingZero
      : remaining > 0
        ? splitStrings.remainingPositive(formattedRemaining)
        : splitStrings.remainingNegative(formattedRemaining);

  const togglePicker = useCallback((key: string) => {
    setActivePickerKey(current => (current === key ? null : key));
  }, []);

  const handleCreate = useCallback(
    (rowId: string, role: AccountRole, intent: CreateAccountIntent) => {
      onCreateAccountRequestForRow(rowId, role, intent);
      setActivePickerKey(null);
    },
    [onCreateAccountRequestForRow],
  );

  const renderSide = (
    side: Side,
    title: string,
    total: number,
    lines: JournalEntryLine[],
    canRemove: boolean,
    onAdd: () => void,
    addLabel: string,
  ) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <AppText variant="body" color="primary" weight="bold">
          {title}
        </AppText>
        {side === 'to' ? (
          <View style={styles.actions}>
            <PressScaleTouchable
              onPress={equalizeToLines}
              disabled={!canEqualize}
              style={[styles.actionButton, { opacity: canEqualize ? 1 : 0.45 }]}
              accessibilityRole="button"
              testID="advanced-equal-split"
            >
              <AppText variant="caption" color="secondary" weight="semibold">
                {splitStrings.equalSplit}
              </AppText>
            </PressScaleTouchable>
            <View
              style={[
                styles.actionDivider,
                { backgroundColor: withOpacity(theme.border, Opacity.active) },
              ]}
            />
            <PressScaleTouchable
              onPress={distributeToLines}
              disabled={!canDistribute}
              style={[styles.actionButton, { opacity: canDistribute ? 1 : 0.45 }]}
              accessibilityRole="button"
              testID="advanced-distribute"
            >
              <AppText variant="caption" color="secondary" weight="semibold">
                {splitStrings.distribute}
              </AppText>
            </PressScaleTouchable>
          </View>
        ) : (
          <AppText variant="caption" color="secondary" weight="semibold">
            {CurrencyFormatter.format(total, workplaceCurrency)}
          </AppText>
        )}
      </View>
      <View style={styles.rows}>
        {lines.map(line => (
          <SplitAllocationRow
            key={line.id}
            allAccounts={accounts}
            allocationAccounts={accounts}
            canRemove={canRemove}
            emptyPrompt={strings.chooseAccount}
            fx={rowFx[line.id]}
            isExpanded={activePickerKey === line.id}
            label={title}
            role={side === 'from' ? 'source' : 'destination'}
            testIDPrefix={`advanced-${side}`}
            onCreateAccountRequest={(role, intent) => handleCreate(line.id, role, intent)}
            onRemove={() => {
              setActivePickerKey(current => (current === line.id ? null : current));
              removeLine(line.id);
            }}
            onSelectAccount={accountId => {
              selectAccount(line.id, accountId);
              setActivePickerKey(null);
            }}
            onToggle={() => togglePicker(line.id)}
            onChangeAmount={amount => updateAmount(line.id, amount)}
            notes={showLineNotes ? line.notes : undefined}
            notesPlaceholder={strings.notesPlaceholder}
            onChangeNotes={showLineNotes ? notes => updateNotes(line.id, notes) : undefined}
            onConvertedAmountChange={amount => updateConvertedAmount(line.id, amount)}
            onResetToApiRate={() => resetRate(line.id)}
            onMove={() => moveLine(line.id)}
            moveLabel={strings.moveToSide(side === 'from' ? strings.toTitle : strings.fromTitle)}
            moveIcon={side === 'from' ? Icon.ArrowDown : Icon.ArrowUp}
            removeLabel={strings.removeLine}
            row={{ id: line.id, accountId: line.accountId, amount: line.amount }}
          />
        ))}
      </View>
      <PressScaleTouchable
        onPress={onAdd}
        style={styles.addButtonTouchable}
        surfaceStyle={[
          styles.addButton,
          { borderColor: withOpacity(theme.primary, Opacity.medium) },
        ]}
        accessibilityRole="button"
        testID={`advanced-add-${side}`}
      >
        <AppIcon name={Icon.Plus} size={Size.iconXs} color={theme.primary} />
        <AppText variant="caption" color="primary" weight="semibold">
          {addLabel}
        </AppText>
      </PressScaleTouchable>
      {canRemove ? (
        <AppText variant="caption" color="tertiary" style={styles.swipeHint}>
          {strings.swipeToRemove}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <AppText variant="caption" color="secondary" style={styles.intro}>
        {strings.intro}
      </AppText>
      {renderSide(
        'from',
        strings.fromTitle,
        fromTotal,
        fromLines,
        canRemoveFrom,
        addFromLine,
        strings.addFrom,
      )}
      {statusLabel ? (
        <AppText
          variant="caption"
          weight="semibold"
          style={[
            styles.status,
            {
              color: isBalanced ? theme.primary : remaining < 0 ? theme.error : theme.textSecondary,
            },
          ]}
        >
          {statusLabel}
        </AppText>
      ) : null}
      {renderSide('to', strings.toTitle, toTotal, toLines, canRemoveTo, addToLine, strings.addTo)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: Spacing.xxl },
  intro: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  section: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  actions: { flexDirection: 'row', gap: Spacing.xs },
  actionDivider: {
    width: StyleSheet.hairlineWidth,
    height: Spacing.md,
    alignSelf: 'center',
  },
  actionButton: {
    minHeight: Size.buttonSm,
    paddingHorizontal: Spacing.xs,
    justifyContent: 'center',
  },
  rows: { gap: Spacing.sm },
  status: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  addButtonTouchable: {
    alignSelf: 'center',
    width: '42%',
    marginTop: Spacing.md,
  },
  addButton: {
    minHeight: Size.buttonSm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Shape.radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  swipeHint: {
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
});
