import { AccountListRow } from '@/src/components/accounts/AccountListRow';
import { ListGroup } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import type { AccountId } from '@/src/types/ids';
import type { AccountFields, PlainAccount } from '@/src/types/plainDtos';
import { formatPersonAccountRoleLabel, type PersonPickerGroup } from './personAccountGrouping';

type PersonAccountChooserModalProps = {
  visible: boolean;
  personName: string;
  accounts: readonly (AccountFields | PlainAccount)[];
  peopleGroups?: readonly PersonPickerGroup[];
  selectedId?: AccountId;
  onClose: () => void;
  onSelect: (accountId: AccountId) => void;
};

/** Second step after tapping a person who has more than one linked account. */
export function PersonAccountChooserModal({
  visible,
  personName,
  accounts,
  peopleGroups,
  selectedId,
  onClose,
  onSelect,
}: PersonAccountChooserModalProps) {
  return (
    <ModalSurface
      visible={visible}
      title={`Choose account for ${personName}`}
      onClose={onClose}
      position="bottomSheet"
      fixedHeight={false}
      contentTestID="person-account-chooser-modal"
    >
      <ListGroup>
        {accounts.map(account => (
          <AccountListRow
            key={account.id}
            item={{
              ...account,
              name: formatPersonAccountRoleLabel(account, peopleGroups),
            }}
            isSelected={selectedId === account.id}
            onPress={onSelect}
            testID={`person-account-chooser-${account.id}`}
          />
        ))}
      </ListGroup>
    </ModalSurface>
  );
}
