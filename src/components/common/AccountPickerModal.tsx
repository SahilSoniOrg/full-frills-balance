import Account from '@/src/data/models/Account';
import { AccountId, PlainAccount } from '@/src/types/domain';
import { useCallback, useMemo } from 'react';
import { AccountPickerList, CreateAccountIntent } from './AccountPickerList';
import { BaseAccountPickerModal } from './BaseAccountPickerModal';

export type { CreateAccountIntent };

export interface AccountPickerModalProps {
  visible: boolean;
  accounts: (Account | PlainAccount)[];
  selectedId?: AccountId;
  title?: string;
  onClose: () => void;
  onSelect: (accountId: AccountId) => void;
  onCreateRequest?: (intent: CreateAccountIntent) => void;
  excludeParentAccounts?: boolean;
}

export function AccountPickerModal({
  visible,
  accounts,
  selectedId,
  title = 'Select Account',
  onClose,
  onSelect,
  onCreateRequest,
  excludeParentAccounts = false,
}: AccountPickerModalProps) {
  const handleSelect = useCallback(
    (id: AccountId) => {
      onSelect(id);
    },
    [onSelect],
  );

  const selectedIds = useMemo(() => new Set(selectedId ? [selectedId] : []), [selectedId]);

  return (
    <BaseAccountPickerModal visible={visible} onClose={onClose} title={title}>
      <AccountPickerList
        accounts={accounts}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        onCreateRequest={onCreateRequest}
        onClose={onClose}
        isMultiple={false}
        excludeParentAccounts={excludeParentAccounts}
      />
    </BaseAccountPickerModal>
  );
}
