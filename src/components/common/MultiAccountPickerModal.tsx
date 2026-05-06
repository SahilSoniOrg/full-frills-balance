import Account from '@/src/data/models/Account';
import { AccountId } from '@/src/types/domain';
import React from 'react';
import { AccountPickerList, CreateAccountIntent } from './AccountPickerList';
import { BaseAccountPickerModal } from './BaseAccountPickerModal';

export interface MultiAccountPickerModalProps {
  visible: boolean;
  accounts: Account[];
  selectedIds: AccountId[];
  title?: string;
  onClose: () => void;
  onSelect: (accountIds: AccountId[]) => void;
  onCreateRequest?: (intent: CreateAccountIntent) => void;
  excludeParentAccounts?: boolean;
}

export function MultiAccountPickerModal({
  visible,
  accounts,
  selectedIds,
  title = 'Select Accounts',
  onClose,
  onSelect,
  onCreateRequest,
  excludeParentAccounts = false,
}: MultiAccountPickerModalProps) {
  const handleApply = (ids: Set<AccountId>) => {
    onSelect(Array.from(ids));
    onClose();
  };

  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <BaseAccountPickerModal visible={visible} onClose={onClose} title={title}>
      <AccountPickerList
        accounts={accounts}
        selectedIds={selectedSet}
        onApply={handleApply}
        onCreateRequest={onCreateRequest}
        onClose={onClose}
        isMultiple={true}
        excludeParentAccounts={excludeParentAccounts}
      />
    </BaseAccountPickerModal>
  );
}
