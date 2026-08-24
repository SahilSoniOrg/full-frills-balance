import { AccountPickerModal } from './AccountPickerModal';
import {
  AccountArchiveCascadeModal,
  type AccountArchiveCascadeModalProps,
} from '@/src/features/accounts/components/AccountArchiveCascadeModal';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountId } from '@/src/types/ids';
import { PlainAccount } from '@/src/types/plainDtos';

export type AccountMergePickerModalProps = {
  visible: boolean;
  onClose: () => void;
  accounts: (AccountFields | PlainAccount)[];
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
