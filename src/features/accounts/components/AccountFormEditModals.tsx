import { AccountPickerModal } from './AccountPickerModal';
import {
  AccountArchiveCascadeModal,
  type AccountArchiveCascadeModalProps,
} from '@/src/features/accounts/components/AccountArchiveCascadeModal';
import Account from '@/src/data/models/Account';
import { AccountId, PlainAccount } from '@/src/types/domain';

export type AccountMergePickerModalProps = {
  visible: boolean;
  onClose: () => void;
  accounts: (Account | PlainAccount)[];
  onSelect: (targetAccountId: AccountId) => void;
  title: string;
};

export type AccountFormEditModalsProps = {
  archiveCascadeModal: AccountArchiveCascadeModalProps | null;
  mergePickerModal: AccountMergePickerModalProps | null;
};

export function AccountFormEditModals({
  archiveCascadeModal,
  mergePickerModal,
}: AccountFormEditModalsProps) {
  return (
    <>
      {archiveCascadeModal ? <AccountArchiveCascadeModal {...archiveCascadeModal} /> : null}
      {mergePickerModal ? <AccountPickerModal {...mergePickerModal} /> : null}
    </>
  );
}
