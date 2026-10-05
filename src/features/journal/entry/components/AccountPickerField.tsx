import type { CreateAccountIntent } from '@/src/components/account-selection';
import type { FxPair } from '@/src/domain/accounting/fxPair';
import type { AccountRole } from '@/src/types/domainJournal';
import type { AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { type ReactNode } from 'react';
import { Keyboard, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { AccountPickerPanel } from '@/src/components/account-selection/AccountPickerPanel';
import { AccountPickerNode } from '@/src/components/account-selection/AccountPickerPanel.parts';
import { ExchangeRateCard } from '@/src/components/forms/ExchangeRateCard';

/** Workplace rate for this account. The field shows it when the account currency is not the workplace currency. */
export interface AccountPickerExchangeRate {
  pair: FxPair;
  precision?: number;
  onConvertedAmountChange: (value: string) => void;
  onResetToApiRate: () => void;
  testIDPrefix?: string;
}

export interface AccountPickerFieldProps {
  account?: AccountFields;
  accounts: AccountFields[];
  allAccounts?: AccountFields[];
  containerStyle?: StyleProp<ViewStyle>;
  displayMode?: 'standard' | 'compact';
  emptyPrompt: string;
  isExpanded: boolean;
  label: string;
  onCreateAccountRequest?: (role: AccountRole, intent: CreateAccountIntent) => void;
  onSelect: (id: AccountId) => void;
  onToggle: () => void;
  role: AccountRole;
  testIDPrefix?: string;
  /** Sits in the tab row, so the folder body spans the account and this control. */
  trailing?: ReactNode;
  exchangeRate?: AccountPickerExchangeRate;
}

/** A single account selector. Simple mode composes two of these with a route connector. */
export function AccountPickerField({
  account,
  accounts,
  allAccounts,
  containerStyle,
  displayMode = 'standard',
  emptyPrompt,
  isExpanded,
  label,
  onCreateAccountRequest,
  onSelect,
  onToggle,
  role,
  testIDPrefix = 'account-picker',
  trailing,
  exchangeRate,
}: AccountPickerFieldProps) {
  const visibleRate =
    exchangeRate && (exchangeRate.pair.isCrossCurrency || exchangeRate.pair.needsManualRates)
      ? exchangeRate
      : null;
  const panel = (
    <AccountPickerPanel
      activeLeg={{ account, accounts, emptyPrompt, label, onSelect, role }}
      activeSide="left"
      allAccounts={allAccounts}
      containerStyle={visibleRate ? styles.flush : containerStyle}
      dropdownTestID={`${testIDPrefix}-source-dropdown`}
      expansionPosition={isExpanded ? 'left' : null}
      lazyDropdown
      onCreateAccountRequest={onCreateAccountRequest}
      renderNodes={({ visualSide, onLeftTabWrapperLayout }) => (
        <>
          <AccountPickerNode
            account={account}
            emptyPrompt={emptyPrompt}
            isExpanded={visualSide === 'left'}
            label={label}
            showLabel={displayMode === 'standard'}
            onLayout={onLeftTabWrapperLayout}
            onPress={() => {
              Keyboard.dismiss();
              onToggle();
            }}
            testID={`${testIDPrefix}-source-node`}
          />
          {trailing}
        </>
      )}
    />
  );

  if (!visibleRate) return panel;

  return (
    <ExchangeRateCard
      variant="attached"
      pair={visibleRate.pair}
      precision={visibleRate.precision}
      onConvertedAmountChange={visibleRate.onConvertedAmountChange}
      onResetToApiRate={visibleRate.onResetToApiRate}
      testIDPrefix={visibleRate.testIDPrefix}
      containerStyle={containerStyle}
    >
      {panel}
    </ExchangeRateCard>
  );
}

const styles = StyleSheet.create({
  flush: { marginHorizontal: 0 },
});
