import { type CreateAccountIntent } from '@/src/components/account-selection';
import { Size, Spacing } from '@/src/constants/design-tokens';
import type { FxPair } from '@/src/features/journal/entry/fxPair';
import { EntryTransactionCard } from './EntryTransactionCard';
import type { JournalMetaCardProps } from './JournalMetaCard';
import { useSimpleFormExpansion, type AccountFlowHandle } from './useSimpleFormExpansion';
import { AccountRole, TabType } from '@/src/types/domainJournal';
import { AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import React, { type RefObject, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

export interface SimpleFormAccountSection {
  title: string;
  accounts: AccountFields[];
  selectedId: AccountId;
  onSelect: (id: AccountId) => void;
  role: AccountRole;
}

export interface SimpleFormProps {
  type: TabType;
  setType: (type: TabType) => void;
  amount: string;
  setAmount: (val: string) => void;
  currency: string;
  accentColor: string;
  precision?: number;
  meta: JournalMetaCardProps;
  onScrollBeginDrag?: () => void;

  // Accounts
  accounts: AccountFields[];
  accountSections: SimpleFormAccountSection[];
  sourceId: AccountId;
  destinationId: AccountId;
  onSwapAccounts?: () => void;
  onCreateAccountRequest?: (role: AccountRole, intent: CreateAccountIntent) => void;

  // Cross-Currency
  fxPair: FxPair;
  setManualBaseRate: (role: 'source' | 'destination', value: string) => void;
  setConvertedAmount: (value: string) => void;
  resetToApiRate: () => void;
  autoOpenCalculator?: boolean;
  autopilotFirstRole?: AccountRole;
  onCalculatorDone?: () => void;
  accountFlowRef?: RefObject<AccountFlowHandle | null>;
}

export const SimpleForm = React.memo(function SimpleForm({
  type,
  setType,
  amount,
  setAmount,
  currency,
  accentColor,
  precision = 2,
  meta,
  onScrollBeginDrag,
  accounts,
  accountSections,
  sourceId,
  destinationId,
  onSwapAccounts,
  onCreateAccountRequest,
  fxPair,
  setManualBaseRate,
  setConvertedAmount,
  resetToApiRate,
  autoOpenCalculator = false,
  autopilotFirstRole,
  onCalculatorDone,
  accountFlowRef,
}: SimpleFormProps) {
  const sourceSection = accountSections.find(section => section.role === 'source');
  const destinationSection = accountSections.find(section => section.role === 'destination');
  const {
    expansionPosition,
    handleSelectDestination,
    handleSelectSource,
    handleToggleExpansion,
    startAutopilotAccountFlow,
  } = useSimpleFormExpansion({
    type,
    sourceId,
    destinationId,
    autopilotFirstRole,
    onSelectSource: id => sourceSection?.onSelect(id),
    onSelectDestination: id => destinationSection?.onSelect(id),
  });

  useEffect(() => {
    if (!accountFlowRef) return;
    accountFlowRef.current = { start: startAutopilotAccountFlow };
    return () => {
      accountFlowRef.current = null;
    };
  }, [accountFlowRef, startAutopilotAccountFlow]);

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={onScrollBeginDrag}
      scrollEventThrottle={16}
      testID="simple-entry-scroll-view"
    >
      <EntryTransactionCard
        density="hero"
        meta={meta}
        type={type}
        onChangeType={setType}
        accentColor={accentColor}
        amount={amount}
        onChangeAmount={setAmount}
        currency={currency}
        precision={precision}
        autoOpenCalculator={autoOpenCalculator}
        onCalculatorDone={onCalculatorDone}
        pair={fxPair}
        onManualBaseRateChange={setManualBaseRate}
        onConvertedAmountChange={setConvertedAmount}
        onResetToApiRate={resetToApiRate}
        accountSections={accountSections}
        accounts={accounts}
        sourceId={sourceId}
        destinationId={destinationId}
        expansionPosition={expansionPosition}
        onToggleExpansion={handleToggleExpansion}
        onSelectSource={handleSelectSource}
        onSelectDestination={handleSelectDestination}
        onSwapAccounts={onSwapAccounts}
        onCreateAccountRequest={onCreateAccountRequest}
        exchangeRateContainerStyle={styles.fxCardSpacing}
      />
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xxxxl + Size.xxl,
  },
  fxCardSpacing: {
    marginTop: Spacing.none,
  },
});
