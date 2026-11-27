import type { AccountId } from '@/src/types/ids';
import type { AccountFields, PlainAccount } from '@/src/types/plainDtos';
import { useCallback, useState } from 'react';
import { linkedAccountsForPerson, type PersonPickerGroup } from './personAccountGrouping';

type PendingChooser = {
  personName: string;
  accounts: (AccountFields | PlainAccount)[];
};

/**
 * Person pills collapse to one row; multi-account people open a second chooser.
 */
export function usePersonLinkedAccountSelect({
  accounts,
  peopleGroups,
  onSelect,
}: {
  accounts: readonly (AccountFields | PlainAccount)[];
  peopleGroups?: readonly PersonPickerGroup[];
  onSelect: (accountId: AccountId) => void;
}) {
  const [pending, setPending] = useState<PendingChooser | null>(null);

  const selectAccount = useCallback(
    (accountId: AccountId) => {
      const person = peopleGroups?.find(group => group.accountIds.includes(accountId));
      if (!person) {
        onSelect(accountId);
        return;
      }
      const linked = linkedAccountsForPerson(person, accounts);
      if (linked.length <= 1) {
        onSelect(linked[0]?.id ?? accountId);
        return;
      }
      setPending({ personName: person.personName, accounts: linked });
    },
    [accounts, onSelect, peopleGroups],
  );

  const closeChooser = useCallback(() => setPending(null), []);

  const confirmChooserAccount = useCallback(
    (accountId: AccountId) => {
      setPending(null);
      onSelect(accountId);
    },
    [onSelect],
  );

  return {
    selectAccount,
    chooserVisible: pending != null,
    chooserPersonName: pending?.personName ?? '',
    chooserAccounts: pending?.accounts ?? [],
    closeChooser,
    confirmChooserAccount,
  };
}
