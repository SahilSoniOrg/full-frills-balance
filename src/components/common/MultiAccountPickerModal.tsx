import Account from '@/src/data/models/Account';
import { AccountId } from '@/src/types/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccountPickerList,
  CreateAccountIntent,
} from '@/src/features/accounts/components/AccountPickerList';
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
  const [draftSelected, setDraftSelected] = useState<Set<AccountId>>(() => new Set(selectedIds));
  const wasVisibleRef = useRef(false);

  // Seed draft from committed selection when the modal opens.
  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      setDraftSelected(new Set(selectedIds));
    }
    wasVisibleRef.current = visible;
  }, [visible, selectedIds]);

  const handleToggle = useCallback((id: AccountId) => {
    setDraftSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleApply = useCallback(
    (ids: Set<AccountId>) => {
      onSelect(Array.from(ids));
      onClose();
    },
    [onSelect, onClose],
  );

  return (
    <BaseAccountPickerModal visible={visible} onClose={onClose} title={title}>
      <AccountPickerList
        accounts={accounts}
        selectedIds={draftSelected}
        onToggle={handleToggle}
        onApply={handleApply}
        onCreateRequest={onCreateRequest}
        onClose={onClose}
        isMultiple={true}
        excludeParentAccounts={excludeParentAccounts}
      />
    </BaseAccountPickerModal>
  );
}
