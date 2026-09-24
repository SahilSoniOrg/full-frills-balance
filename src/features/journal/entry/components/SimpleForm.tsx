import { type CreateAccountIntent } from '@/src/components/account-selection';
import { AppConfig } from '@/src/constants';
import { Size, Spacing } from '@/src/constants/design-tokens';
import type { FxPair } from '@/src/features/journal/entry/fxPair';
import { EntryTransactionCard } from './EntryTransactionCard';
import type { JournalMetaCardProps } from './JournalMetaCard';
import { useSimpleFormExpansion, type AccountFlowHandle } from './useSimpleFormExpansion';
import { AccountRole, TabType } from '@/src/types/domainJournal';
import { AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import React, { type RefObject, useEffect, useMemo } from 'react';
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
  const accountsMap = useMemo(
    () => new Map<string, AccountFields>(accounts.map(a => [a.id, a])),
    [accounts],
  );

  const sourceAccount = useMemo(
    () => (sourceId ? accountsMap.get(sourceId) : undefined),
    [accountsMap, sourceId],
  );
  const destAccount = useMemo(
    () => (destinationId ? accountsMap.get(destinationId) : undefined),
    [accountsMap, destinationId],
  );

  // Section titles and configs
  const sourceSection = useMemo(
    () => accountSections.find(s => s.role === 'source'),
    [accountSections],
  );
  const destSection = useMemo(
    () => accountSections.find(s => s.role === 'destination'),
    [accountSections],
  );

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
    onSelectDestination: id => destSection?.onSelect(id),
  });

  useEffect(() => {
    if (!accountFlowRef) return;
    accountFlowRef.current = { start: startAutopilotAccountFlow };
    return () => {
      accountFlowRef.current = null;
    };
  }, [accountFlowRef, startAutopilotAccountFlow]);

  // Node Labels: Left is Source, Right is Destination
  const sourceLabel =
    sourceSection?.title || AppConfig.strings.transactionFlow.simpleEntry.sourceAccount;
  const destLabel =
    destSection?.title || AppConfig.strings.transactionFlow.simpleEntry.destinationAccount;

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
        meta={meta}
        typeSwitcher={{ value: type, onChange: setType, accentColor }}
        amount={{
          variant: 'hero',
          amount,
          setAmount,
          currency,
          accentColor,
          precision,
          autoOpenCalculator,
          onCalculatorDone,
        }}
        exchangeRate={{
          pair: fxPair,
          destLabel,
          onManualBaseRateChange: setManualBaseRate,
          onConvertedAmountChange: setConvertedAmount,
          onResetToApiRate: resetToApiRate,
          precision,
        }}
        accountSections={{
          expansionPosition,
          onToggleExpansion: handleToggleExpansion,
          sourceLabel,
          sourceAccount,
          sourceAccounts: sourceSection?.accounts ?? [],
          onSelectSource: handleSelectSource,
          destLabel,
          destAccount,
          destAccounts: destSection?.accounts ?? [],
          onSelectDestination: handleSelectDestination,
          type,
          onSwapAccounts,
          allAccounts: accounts,
          onCreateAccountRequest,
        }}
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
