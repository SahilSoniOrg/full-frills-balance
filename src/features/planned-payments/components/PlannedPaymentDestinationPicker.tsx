import { AppInput, AppText, Icon } from '@/src/components/core';
import { FormRow } from '@/src/components/forms';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { plannedPaymentFormStrings as copy } from '@/src/constants/copy/domains/plannedPaymentFormStrings';
import type { AccountId } from '@/src/types/ids';
import type { PlainAccount } from '@/src/types/plainDtos';
import { getAccountIcon } from '@/src/utils/accountIcon';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

interface PlannedPaymentDestinationPickerProps {
  visible: boolean;
  accounts: PlainAccount[];
  selectedId: AccountId;
  onClose: () => void;
  onSelect: (accountId: AccountId) => void;
}

export function PlannedPaymentDestinationPicker({
  visible,
  accounts,
  selectedId,
  onClose,
  onSelect,
}: PlannedPaymentDestinationPickerProps) {
  const [query, setQuery] = useState('');
  const filteredAccounts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return accounts;
    return accounts.filter(account =>
      [account.name, account.accountType, account.currencyCode]
        .filter((value): value is string => Boolean(value))
        .some(value => value.toLowerCase().includes(normalized)),
    );
  }, [accounts, query]);

  return (
    <ModalSurface
      visible={visible}
      title={copy.selectDestination}
      onClose={onClose}
      position="bottomSheet"
      fixedHeight={false}
      maxHeightPercent={90}
      closeTestID="planned-payment-destination-close"
    >
      <AppInput
        value={query}
        onChangeText={setQuery}
        placeholder={copy.searchAccounts}
        leftIcon={Icon.Search}
        testID="planned-payment-destination-search"
      />
      {filteredAccounts.length ? (
        filteredAccounts.map(account => (
          <FormRow
            key={account.id}
            icon={getAccountIcon(account)}
            title={account.name}
            subtitle={[account.accountType, account.currencyCode].filter(Boolean).join(' · ')}
            value={account.id === selectedId ? copy.selected : undefined}
            onPress={() => onSelect(account.id)}
            showSeparator
            testID={`planned-payment-destination-option-${account.id}`}
          />
        ))
      ) : (
        <View style={{ paddingVertical: 24 }}>
          <AppText variant="body" color="secondary">
            {copy.noMatchingAccounts}
          </AppText>
        </View>
      )}
    </ModalSurface>
  );
}
