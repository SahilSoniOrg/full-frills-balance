import type { ScreenHeaderActionItem } from '@/src/components/common/ScreenHeaderActions';
import type { AccountArchiveCascadeModalProps } from '@/src/features/accounts/components/AccountArchiveCascadeModal';
import type { AccountMergePickerModalProps } from '@/src/features/accounts/components/AccountFormEditModals';
import {
  useAccountArchiveAction,
  type UseAccountArchiveActionArgs,
} from '@/src/features/accounts/hooks/useAccountArchiveAction';
import {
  useAccountDeleteMergeActions,
  type UseAccountDeleteMergeActionsOptions,
} from '@/src/features/accounts/hooks/useAccountDeleteMergeActions';
import { useMemo } from 'react';

type UseAccountFormHeaderActionsArgs = UseAccountArchiveActionArgs &
  Pick<
    UseAccountDeleteMergeActionsOptions,
    | 'transactionCount'
    | 'isDeleted'
    | 'entityLabel'
    | 'deleteAccount'
    | 'recoverAction'
    | 'mergeAccounts'
  >;

export type AccountFormChromeState = {
  headerActionItems: ScreenHeaderActionItem[];
  archiveCascadeModal: AccountArchiveCascadeModalProps | null;
  mergePickerModal: AccountMergePickerModalProps | null;
};

export function useAccountFormHeaderActions({
  enabled,
  workplaceId,
  accountId,
  account,
  accounts,
  transactionCount,
  isDeleted,
  entityLabel,
  deleteAccount,
  recoverAction,
  mergeAccounts,
}: UseAccountFormHeaderActionsArgs): AccountFormChromeState {
  const archive = useAccountArchiveAction({
    enabled,
    workplaceId,
    accountId,
    account,
    accounts,
  });

  const deleteMerge = useAccountDeleteMergeActions({
    accountId,
    account: account ?? null,
    accounts,
    transactionCount,
    isDeleted,
    enabled,
    entityLabel,
    deleteAccount,
    recoverAction,
    mergeAccounts,
  });

  const headerActionItems = useMemo(
    (): ScreenHeaderActionItem[] => [
      ...archive.headerActionItems,
      ...deleteMerge.headerActionItems,
    ],
    [archive.headerActionItems, deleteMerge.headerActionItems],
  );

  return {
    headerActionItems,
    archiveCascadeModal: archive.archiveCascadeModal,
    mergePickerModal: deleteMerge.mergePickerModal,
  };
}
