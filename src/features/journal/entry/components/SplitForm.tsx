import type { CreateAccountIntent } from '@/src/components/account-selection';
import { AppText } from '@/src/components/core';
import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { AppConfig, Spacing } from '@/src/constants';
import {
  AllocationActions,
  AllocationRows,
  AllocationSection,
  AllocationStatusText,
  useExclusivePicker,
} from '@/src/features/journal/entry/components/AllocationSection';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import {
  distributeSplitRemainder,
  equalizeSplitAmounts,
  SPLIT_SOURCE_LINE_ID,
} from '@/src/services/journal/splitJournalHelpers';
import type { AccountRole, TabType } from '@/src/types/domainJournal';
import { EMPTY_ACCOUNT_ID, type AccountId, type PersonId, type WorkplaceId } from '@/src/types/ids';
import { formatRoundedAmount } from '@/src/domain/money/money';
import { AccountPickerField } from '@/src/features/journal/entry/components/AccountPickerField';
import { NoticeBanner } from '@/src/components/shared/NoticeBanner';
import { Icon } from '@/src/types/domainIcons';
import {
  allocationAmountStyles,
  formatAmountPlaceholder,
} from '@/src/features/journal/entry/components/SplitAllocationRow';
import { TransactionTypeSegmentedControl } from '@/src/features/journal/entry/components/TransactionTypeSegmentedControl';
import { SplitJournalController } from '@/src/features/journal/entry/modes/split/splitJournalState';
import {
  resolveAllocationStatus,
  resolveSimpleTypeAccentColor,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PersonPickerGroup } from '@/src/components/account-selection/personAccountGrouping';
import { SplitPeopleParticipantsBar, type SplitParticipant } from './SplitPeopleParticipantsBar';
import { ensurePersonAccount } from '@/src/services/people';
import { AccountType } from '@/src/types/enums';
import { parseSimpleAmountInput } from '@/src/services/journal/simpleJournalHelpers';
import { showErrorAlert } from '@/src/services/feedback/alerts';
import { StyleSheet, View } from 'react-native';

type SplitFormProps = SplitJournalController & {
  people?: SplitParticipant[];
  peopleGroups?: readonly PersonPickerGroup[];
  initialPersonId?: PersonId;
  workplaceId?: WorkplaceId;
  onQuickAddPerson?: (
    name: string,
    currencyCode?: string,
  ) => Promise<AccountId | { id: AccountId; name: string } | void>;
  onCreatePersonRequest?: () => void;
  onCreateAccountRequestForRow: (
    rowId: string,
    role: AccountRole,
    intent: CreateAccountIntent,
  ) => void;
};

function resolveSplitTypeCopy(type: TabType) {
  const simpleStrings = AppConfig.strings.transactionFlow.simpleEntry;
  const splitStrings = AppConfig.strings.transactionFlow.splitEntry;

  if (type === 'income') {
    return {
      sourceLabel: simpleStrings.fromSource,
      sourceEmptyPrompt: simpleStrings.chooseCategory,
      allocationTitle: simpleStrings.toAccount,
      allocationLabel: simpleStrings.toAccount,
      allocationEmptyPrompt: simpleStrings.chooseAccount,
      totalLabel: splitStrings.totalAmount,
    };
  }

  if (type === 'transfer') {
    return {
      sourceLabel: simpleStrings.sourceAccount,
      sourceEmptyPrompt: simpleStrings.chooseAccount,
      allocationTitle: simpleStrings.destinationAccount,
      allocationLabel: simpleStrings.destinationAccount,
      allocationEmptyPrompt: simpleStrings.chooseAccount,
      totalLabel: splitStrings.totalAmount,
    };
  }

  return {
    sourceLabel: splitStrings.fromAccount,
    sourceEmptyPrompt: simpleStrings.chooseAccount,
    allocationTitle: splitStrings.categoriesTitle,
    allocationLabel: splitStrings.category,
    allocationEmptyPrompt: splitStrings.chooseCategory,
    totalLabel: splitStrings.totalAmount,
  };
}

export function SplitForm({
  totalAmount,
  setTotalAmount,
  transactionType,
  setTransactionType,
  splits,
  splitFx,
  sourceFx,
  canEqualize,
  addSplitRow,
  removeSplitRow,
  removeSplitRowsForAccounts,
  updateSplitRow,
  updateSplitAmounts,
  updateAmount,
  updateConvertedAmount,
  resetRate,
  updateSourceConvertedAmount,
  resetSourceRate,
  totals,
  currencyContext,
  validationError,
  allAccounts,
  sourceAccounts,
  allocationAccounts,
  sourceAccount,
  setSourceAccountId,
  displayCurrency,
  precision,
  addSplitRowWithAccount,
  people = [],
  peopleGroups = [],
  onCreatePersonRequest,
  workplaceId,
  initialPersonId,
  onQuickAddPerson,
  onCreateAccountRequestForRow,
}: SplitFormProps) {
  const { theme, fonts } = useTheme();
  const strings = AppConfig.strings.transactionFlow.splitEntry;
  const { isExpanded, toggle, close, closeIf } = useExclusivePicker();
  const typeCopy = resolveSplitTypeCopy(transactionType);
  const currencyCode = displayCurrency.trim().toUpperCase() || 'USD';
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const initialPersonSelected = useRef(false);
  const pendingEqualizeRef = useRef(false);
  const currencySymbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode;
  const hasTotal = totals.total > 0;
  // Split entries require at least one allocation. The controller also
  // enforces this invariant for non-UI callers.
  const canRemove = splits.length > 1;
  const canDistribute = canEqualize && totals.remaining > 0;
  const allocationStatus = resolveAllocationStatus({
    hasAmount: hasTotal,
    balanced: totals.remaining === 0,
    remaining: totals.remaining,
    formattedAmount: `${currencySymbol} ${formatRoundedAmount(Math.abs(totals.remaining), precision)}`,
    emptyLabel: strings.enterTotal,
  });
  const validationMessage = validationError ? strings.validation[validationError] : null;

  const applyAmounts = useCallback(
    (nextSplits: SplitJournalController['splits']) => {
      const updates: Record<string, string> = {};
      nextSplits.forEach(nextRow => {
        const currentRow = splits.find(row => row.id === nextRow.id);
        if (!currentRow || currentRow.amount === nextRow.amount) return;
        updates[nextRow.id] = nextRow.amount;
      });
      if (Object.keys(updates).length > 0) updateSplitAmounts(updates);
    },
    [splits, updateSplitAmounts],
  );

  const handleEqualSplit = useCallback(() => {
    if (!canEqualize) return;
    const allocatedRows = splits.filter(row => row.accountId && row.accountId !== EMPTY_ACCOUNT_ID);
    if (allocatedRows.length === 0) return;
    applyAmounts(equalizeSplitAmounts(totalAmount, allocatedRows, precision, currencyContext));
  }, [applyAmounts, canEqualize, currencyContext, precision, splits, totalAmount]);

  const personAccountIds = useMemo(
    () => new Set(peopleGroups.flatMap(group => group.accountIds)),
    [peopleGroups],
  );
  const effectiveAllocationAccounts = useMemo(() => {
    const existingIds = new Set(allocationAccounts.map(account => account.id));
    const personExtras = allAccounts.filter(
      account => personAccountIds.has(account.id) && !existingIds.has(account.id),
    );
    return personExtras.length > 0 ? [...allocationAccounts, ...personExtras] : allocationAccounts;
  }, [allAccounts, allocationAccounts, personAccountIds]);
  const selectedPersonIds = peopleGroups
    .filter(group => group.accountIds.some(id => splits.some(row => row.accountId === id)))
    .map(group => group.personId as PersonId);
  const onTogglePerson = useCallback(
    async (personId: PersonId) => {
      const group = peopleGroups.find(candidate => candidate.personId === personId);
      if (!group) return;
      const matchingRows = splits.filter(row => group.accountIds.includes(row.accountId));
      if (matchingRows.length) {
        if (splitMode === 'equal') pendingEqualizeRef.current = true;
        removeSplitRowsForAccounts(matchingRows.map(row => row.accountId));
        return;
      }
      if (!workplaceId) return;
      const account = await ensurePersonAccount(workplaceId, personId, 'receivable', currencyCode);
      if (splitMode === 'equal') pendingEqualizeRef.current = true;
      addSplitRowWithAccount(account.id, {
        name: account.name,
        accountType: account.accountType,
        currencyCode: account.currencyCode,
      });
    },
    [
      addSplitRowWithAccount,
      currencyCode,
      peopleGroups,
      removeSplitRowsForAccounts,
      splitMode,
      splits,
      workplaceId,
    ],
  );
  useEffect(() => {
    if (
      initialPersonSelected.current ||
      !initialPersonId ||
      !workplaceId ||
      selectedPersonIds.length ||
      !peopleGroups.some(group => group.personId === initialPersonId)
    )
      return;
    initialPersonSelected.current = true;
    void onTogglePerson(initialPersonId).catch(error => {
      initialPersonSelected.current = false;
      showErrorAlert(
        error instanceof Error ? error.message : 'Could not add the selected person to this split',
      );
    });
  }, [initialPersonId, onTogglePerson, peopleGroups, selectedPersonIds.length, workplaceId]);
  useEffect(() => {
    if (!pendingEqualizeRef.current || splitMode !== 'equal' || !canEqualize) return;
    pendingEqualizeRef.current = false;
    handleEqualSplit();
  }, [canEqualize, handleEqualSplit, splitMode, splits]);
  const handleAmountChange = useCallback(
    (id: string, amount: string) => {
      updateAmount(id, amount);
      if (selectedPersonIds.length) setSplitMode('custom');
    },
    [selectedPersonIds.length, updateAmount],
  );
  const canAddRemainingToYours =
    totals.remaining > 0 && splits.some(row => !personAccountIds.has(row.accountId));
  const onAddRemainingToYours = useCallback(() => {
    const row = splits.find(candidate => !personAccountIds.has(candidate.accountId));
    if (row)
      updateSplitRow(row.id, {
        amount: formatRoundedAmount(
          parseSimpleAmountInput(row.amount) + totals.remaining,
          precision,
        ),
      });
  }, [personAccountIds, precision, splits, totals.remaining, updateSplitRow]);
  const changeSplitMode = useCallback(
    (mode: 'equal' | 'custom') => {
      setSplitMode(mode);
      if (mode === 'equal' && canEqualize) handleEqualSplit();
    },
    [canEqualize, handleEqualSplit],
  );
  const handleQuickAddPerson = useCallback(
    async (name: string) => {
      if (!onQuickAddPerson) return;
      setIsQuickAdding(true);
      try {
        const result = await onQuickAddPerson(name, currencyCode);
        if (!result) return;
        const accountId: AccountId = typeof result === 'string' ? result : result.id;
        const accountName = typeof result === 'string' ? undefined : result.name;
        if (splitMode === 'equal') pendingEqualizeRef.current = true;
        addSplitRowWithAccount(accountId, {
          name: accountName,
          accountType: AccountType.ASSET,
          currencyCode,
        });
      } catch (error) {
        showErrorAlert(error instanceof Error ? error.message : 'Could not add person');
      } finally {
        setIsQuickAdding(false);
      }
    },
    [addSplitRowWithAccount, currencyCode, onQuickAddPerson, splitMode],
  );

  const handleDistribute = useCallback(() => {
    if (canDistribute) {
      applyAmounts(distributeSplitRemainder(totalAmount, splits, precision, currencyContext));
    }
  }, [applyAmounts, canDistribute, currencyContext, precision, splits, totalAmount]);

  const handleRemoveSplitRow = useCallback(
    (id: string) => {
      if (splitMode === 'equal') pendingEqualizeRef.current = true;
      removeSplitRow(id);
    },
    [removeSplitRow, splitMode],
  );

  const handleSourceAccountSelect = useCallback(
    (accountId: AccountId) => {
      setSourceAccountId(accountId);
      close();
    },
    [close, setSourceAccountId],
  );

  const handleCreateAccountRequest = useCallback(
    (rowId: string, role: AccountRole, intent: CreateAccountIntent) => {
      onCreateAccountRequestForRow(rowId, role, intent);
      close();
    },
    [close, onCreateAccountRequestForRow],
  );

  return (
    <View style={styles.container}>
      <TransactionTypeSegmentedControl
        value={transactionType}
        onChange={setTransactionType}
        accentColor={resolveSimpleTypeAccentColor(transactionType, theme)}
        variant="standard"
      />
      <View style={styles.sourceSection}>
        <AppText variant="body" color="primary" weight="bold" style={styles.sectionTitle}>
          {typeCopy.sourceLabel}
        </AppText>
        <AccountPickerField
          account={sourceAccount}
          accounts={sourceAccounts}
          allAccounts={allAccounts}
          containerStyle={styles.folderPicker}
          displayMode="compact"
          emptyPrompt={typeCopy.sourceEmptyPrompt}
          exchangeRate={{
            pair: sourceFx.pair,
            precision: sourceFx.rowPrecision,
            onConvertedAmountChange: updateSourceConvertedAmount,
            onResetToApiRate: resetSourceRate,
            testIDPrefix: 'split-source-fx',
          }}
          isExpanded={isExpanded('source')}
          peopleGroups={peopleGroups}
          onCreatePersonRequest={onCreatePersonRequest}
          label={typeCopy.sourceLabel}
          onCreateAccountRequest={(role, intent) =>
            handleCreateAccountRequest(SPLIT_SOURCE_LINE_ID, role, intent)
          }
          onSelect={handleSourceAccountSelect}
          onToggle={() => toggle('source')}
          role="source"
          testIDPrefix="split-source-picker"
          trailing={
            <CalculatorAmountInput
              variant="compact"
              value={totalAmount}
              onChangeText={setTotalAmount}
              currency={currencyCode}
              currencySymbol={currencySymbol}
              precision={precision}
              placeholder={formatAmountPlaceholder(precision)}
              containerStyle={allocationAmountStyles.container}
              inputStyle={[
                allocationAmountStyles.text,
                { color: theme.text, fontFamily: (fonts.numeric ?? fonts).semibold },
              ]}
              testID="split-total-amount-input"
            />
          }
        />
        <SplitPeopleParticipantsBar
          people={people}
          selectedPersonIds={selectedPersonIds}
          onTogglePerson={onTogglePerson}
          onQuickAddPerson={handleQuickAddPerson}
          hasParticipants={selectedPersonIds.length > 0}
          splitMode={splitMode}
          onChangeSplitMode={changeSplitMode}
          remainingAmountText={`${currencySymbol} ${formatRoundedAmount(Math.abs(totals.remaining), precision)}`}
          isMatched={totals.remaining === 0}
          canAddRemainingToYours={canAddRemainingToYours}
          onAddRemainingToYours={onAddRemainingToYours}
          isQuickAdding={isQuickAdding}
        />
      </View>

      <AllocationSection
        title={typeCopy.allocationTitle}
        headerTrailing={
          <AllocationActions
            canEqualize={canEqualize}
            canDistribute={canDistribute}
            onEqualize={handleEqualSplit}
            onDistribute={handleDistribute}
          />
        }
        status={
          <AllocationStatusText
            label={allocationStatus.label}
            tone={allocationStatus.tone}
            style={styles.allocationStatus}
          />
        }
        footer={
          validationMessage && hasTotal ? (
            <NoticeBanner message={validationMessage} tone="error" icon={Icon.Error} />
          ) : null
        }
        onAdd={addSplitRow}
        addLabel={strings.addSplit}
        addTestID="split-add-row"
        swipeHint={canRemove ? strings.swipeToRemove : null}
        style={styles.allocationSection}
      >
        <AllocationRows
          rows={splits.map(row => ({ ...row, fx: splitFx[row.id] }))}
          accounts={allAccounts}
          rowAccounts={effectiveAllocationAccounts}
          canRemove={canRemove}
          emptyPrompt={typeCopy.allocationEmptyPrompt}
          label={typeCopy.allocationLabel}
          isExpanded={isExpanded}
          onToggle={toggle}
          onClose={close}
          onCloseIf={closeIf}
          onCreateAccount={onCreateAccountRequestForRow}
          peopleGroups={peopleGroups}
          onCreatePersonRequest={onCreatePersonRequest}
          onRemove={handleRemoveSplitRow}
          onSelectAccount={(id, accountId) => updateSplitRow(id, { accountId })}
          onChangeAmount={handleAmountChange}
          onConvertedAmountChange={updateConvertedAmount}
          onResetRate={resetRate}
          removeLabel={strings.removeSplit}
        />
      </AllocationSection>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: Spacing.xxl },
  sourceSection: {
    paddingTop: Spacing.md,
  },
  sectionTitle: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  folderPicker: { marginHorizontal: Spacing.md },
  allocationSection: {
    paddingBottom: Spacing.md,
  },
  allocationStatus: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
});
