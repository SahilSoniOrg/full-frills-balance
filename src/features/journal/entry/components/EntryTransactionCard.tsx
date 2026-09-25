import { CompactAmountInput } from '@/src/components/forms/CompactAmountInput';
import type { CreateAccountIntent } from '@/src/components/account-selection';
import { AppConfig } from '@/src/constants';
import { Spacing } from '@/src/constants/design-tokens';
import type { FxPair } from '@/src/features/journal/entry/fxPair';
import { resolveAccountLeg } from '@/src/services/journal/simpleJournalHelpers';
import { useTheme } from '@/src/hooks/use-theme';
import type { AccountRole, TabType } from '@/src/types/domainJournal';
import type { AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import type { ExpansionPosition } from './AccountPickerPanel';
import { ExchangeRateCard } from './ExchangeRateCard';
import { JournalMetaCard, type JournalMetaCardProps } from './JournalMetaCard';
import { SimpleFormAmountInput } from './SimpleFormAmountInput';
import { SimpleFormAccountSections } from './SimpleFormAccountSections';
import { TransactionTypeSegmentedControl } from './TransactionTypeSegmentedControl';

export type EntryTransactionSection = {
  title: string;
  accounts: AccountFields[];
  role: AccountRole;
};

/** One simple transaction. `compact` is the batch-row density of the same card. */
export interface EntryTransactionCardProps {
  density: 'hero' | 'compact';
  meta: JournalMetaCardProps;
  type: TabType;
  onChangeType: (type: TabType) => void;
  accentColor: string;
  amount: string;
  onChangeAmount: (value: string) => void;
  /** Hero mode passes the editor display currency. Compact mode uses the source account. */
  currency?: string;
  precision?: number;
  autoOpenCalculator?: boolean;
  onCalculatorDone?: () => void;
  amountTestID?: string;
  pair: FxPair;
  onManualBaseRateChange: (role: 'source' | 'destination', value: string) => void;
  onConvertedAmountChange: (value: string) => void;
  onResetToApiRate: () => void;
  fxTestIDPrefix?: string;
  accountSections: EntryTransactionSection[];
  accounts: AccountFields[];
  sourceId: AccountId;
  destinationId: AccountId;
  expansionPosition: ExpansionPosition;
  onToggleExpansion: (side: 'left' | 'right') => void;
  onSelectSource: (id: AccountId) => void;
  onSelectDestination: (id: AccountId) => void;
  onSwapAccounts?: () => void;
  onCreateAccountRequest?: (role: AccountRole, intent: CreateAccountIntent) => void;
  lazyDropdown?: boolean;
  accountTestIDPrefix?: string;
  metaContainerStyle?: StyleProp<ViewStyle>;
  exchangeRateContainerStyle?: StyleProp<ViewStyle>;
  accountSectionsContainerStyle?: StyleProp<ViewStyle>;
}

export function EntryTransactionCard({
  density,
  meta,
  type,
  onChangeType,
  accentColor,
  amount,
  onChangeAmount,
  currency,
  precision,
  autoOpenCalculator,
  onCalculatorDone,
  amountTestID,
  pair,
  onManualBaseRateChange,
  onConvertedAmountChange,
  onResetToApiRate,
  fxTestIDPrefix,
  accountSections,
  accounts,
  sourceId,
  destinationId,
  expansionPosition,
  onToggleExpansion,
  onSelectSource,
  onSelectDestination,
  onSwapAccounts,
  onCreateAccountRequest,
  lazyDropdown,
  accountTestIDPrefix,
  metaContainerStyle,
  exchangeRateContainerStyle,
  accountSectionsContainerStyle,
}: EntryTransactionCardProps) {
  const { theme } = useTheme();
  const labels = AppConfig.strings.transactionFlow.simpleEntry;
  const sourceLeg = resolveAccountLeg(
    accountSections,
    'source',
    sourceId,
    accounts,
    labels.sourceAccount,
  );
  const destLeg = resolveAccountLeg(
    accountSections,
    'destination',
    destinationId,
    accounts,
    labels.destinationAccount,
  );
  const amountCurrency = currency || sourceLeg.account?.currencyCode || '';

  return (
    <>
      <JournalMetaCard
        {...meta}
        containerStyle={[styles.sectionSpacing, meta.containerStyle, metaContainerStyle]}
      />
      {density === 'hero' ? (
        <>
          <TransactionTypeSegmentedControl
            value={type}
            onChange={onChangeType}
            accentColor={accentColor}
            variant="standard"
          />
          <View style={[styles.heroAmount, { backgroundColor: theme.background }]}>
            <SimpleFormAmountInput
              amount={amount}
              setAmount={onChangeAmount}
              currency={amountCurrency}
              accentColor={accentColor}
              precision={precision}
              autoOpenCalculator={autoOpenCalculator}
              onCalculatorDone={onCalculatorDone}
            />
          </View>
        </>
      ) : (
        <View style={styles.amountMetaRow}>
          <TransactionTypeSegmentedControl
            value={type}
            onChange={onChangeType}
            accentColor={accentColor}
            variant="compact"
          />
          <CompactAmountInput
            value={amount}
            onChangeText={onChangeAmount}
            currency={amountCurrency}
            testID={amountTestID}
          />
        </View>
      )}
      <ExchangeRateCard
        pair={pair}
        destLabel={destLeg.label}
        onManualBaseRateChange={onManualBaseRateChange}
        onConvertedAmountChange={onConvertedAmountChange}
        onResetToApiRate={onResetToApiRate}
        precision={precision}
        testIDPrefix={fxTestIDPrefix}
        containerStyle={[styles.sectionSpacing, exchangeRateContainerStyle]}
      />
      <SimpleFormAccountSections
        expansionPosition={expansionPosition}
        onToggleExpansion={onToggleExpansion}
        sourceLabel={sourceLeg.label}
        sourceAccount={sourceLeg.account}
        sourceAccounts={sourceLeg.accounts}
        onSelectSource={onSelectSource}
        destLabel={destLeg.label}
        destAccount={destLeg.account}
        destAccounts={destLeg.accounts}
        onSelectDestination={onSelectDestination}
        type={type}
        onSwapAccounts={onSwapAccounts}
        allAccounts={accounts}
        onCreateAccountRequest={onCreateAccountRequest}
        displayMode={density === 'compact' ? 'compact' : 'standard'}
        containerStyle={accountSectionsContainerStyle}
        lazyDropdown={lazyDropdown}
        testIDPrefix={accountTestIDPrefix}
      />
    </>
  );
}

const styles = StyleSheet.create({
  heroAmount: {
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.none,
    marginBottom: Spacing.sm,
    zIndex: 2,
  },
  amountMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionSpacing: {
    marginBottom: Spacing.sm,
  },
});
