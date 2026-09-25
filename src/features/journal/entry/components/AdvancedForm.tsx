import type { CreateAccountIntent } from '@/src/components/account-selection';
import { AppText, Icon } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import {
  AllocationActions,
  AllocationRows,
  AllocationSection,
  AllocationStatusText,
  useExclusivePicker,
} from '@/src/features/journal/entry/components/AllocationSection';
import type { AdvancedJournalFormController } from '@/src/features/journal/entry/hooks/useAdvancedJournalForm';
import type { AccountRole, JournalEntryLine } from '@/src/types/domainJournal';
import { resolveAllocationStatus } from '@/src/features/journal/entry/journalEntryPresentation';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
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
  const strings = AppConfig.strings.advancedEntry;
  const { isExpanded, toggle, close, closeIf } = useExclusivePicker();
  const allocationStatus = resolveAllocationStatus({
    hasAmount: fromTotal > 0 || toTotal > 0,
    balanced: isBalanced,
    remaining,
    formattedAmount: CurrencyFormatter.format(Math.abs(remaining), workplaceCurrency),
    emptyLabel: null,
  });

  const renderSide = (
    side: Side,
    title: string,
    total: number,
    lines: JournalEntryLine[],
    canRemove: boolean,
    onAdd: () => void,
    addLabel: string,
  ) => (
    <AllocationSection
      title={title}
      headerTrailing={
        side === 'to' ? (
          <AllocationActions
            canEqualize={canEqualize}
            canDistribute={canDistribute}
            onEqualize={equalizeToLines}
            onDistribute={distributeToLines}
            equalTestID="advanced-equal-split"
            distributeTestID="advanced-distribute"
          />
        ) : (
          <AppText variant="caption" color="secondary" weight="semibold">
            {CurrencyFormatter.format(total, workplaceCurrency)}
          </AppText>
        )
      }
      onAdd={onAdd}
      addLabel={addLabel}
      addTestID={`advanced-add-${side}`}
      swipeHint={canRemove ? strings.swipeToRemove : null}
    >
      <AllocationRows
        rows={lines.map(line => ({
          id: line.id,
          accountId: line.accountId,
          amount: line.amount,
          fx: rowFx[line.id],
          notes: line.notes,
          moveLabel: strings.moveToSide(side === 'from' ? strings.toTitle : strings.fromTitle),
          moveIcon: side === 'from' ? Icon.ArrowDown : Icon.ArrowUp,
        }))}
        accounts={accounts}
        rowAccounts={accounts}
        canRemove={canRemove}
        emptyPrompt={strings.chooseAccount}
        label={title}
        role={side === 'from' ? 'source' : 'destination'}
        testIDPrefix={`advanced-${side}`}
        isExpanded={isExpanded}
        onToggle={toggle}
        onClose={close}
        onCloseIf={closeIf}
        onCreateAccount={onCreateAccountRequestForRow}
        onRemove={removeLine}
        onSelectAccount={selectAccount}
        onChangeAmount={updateAmount}
        onConvertedAmountChange={updateConvertedAmount}
        onResetRate={resetRate}
        removeLabel={strings.removeLine}
        notesPlaceholder={strings.notesPlaceholder}
        onChangeNotes={showLineNotes ? updateNotes : undefined}
        onMove={moveLine}
      />
    </AllocationSection>
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
      <AllocationStatusText
        label={allocationStatus.label}
        tone={allocationStatus.tone}
        weight="semibold"
        style={styles.status}
      />
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
  status: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
});
