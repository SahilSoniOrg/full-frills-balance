import { AppConfig } from '@/src/constants';
import type { AccountFields } from '@/src/types/domain';
import { isSystemAccount } from '@/src/services/accounts/accountSystemAccounts';
import { isAccountArchived } from '@/src/utils/accountArchive';
import { confirm, type ConfirmOptions } from '@/src/utils/alerts';
import { AccountId } from '@/src/types/domain';

export type ArchiveIntent = {
  archiving: boolean;
  account: AccountFields;
  accountId: AccountId;
  accounts: AccountFields[];
  hasDescendants: boolean;
  proceed: () => void;
  openCascade: (archiving: boolean, rootId: AccountId) => void;
  commitArchive: (ids: AccountId[], archiving: boolean) => void;
};

export function showArchiveIntentConfirmation(archiving: boolean, onConfirm: () => void) {
  const strings = AppConfig.strings.accounts.archive;
  confirm.show({
    title: archiving ? strings.archiveAccount : strings.unarchiveAccount,
    message: archiving ? strings.archiveDescription : strings.unarchiveDescription,
    confirmText: archiving ? strings.archiveAccount : strings.unarchiveAccount,
    destructive: archiving,
    onConfirm,
  });
}

/** Returns the first confirmation dialog to show, or null when the default archive confirm applies. */
export function resolveArchiveConfirmOptions(
  intent: ArchiveIntent,
): ConfirmOptions | 'default' | null {
  const { archiving, account, accountId, accounts, proceed } = intent;

  if (archiving && isSystemAccount(account)) {
    return {
      title: AppConfig.strings.accounts.archive.systemAccountTitle,
      message: AppConfig.strings.accounts.archive.systemAccountMessage,
      confirmText: AppConfig.strings.accounts.archive.archiveAnyway,
      onConfirm: proceed,
    };
  }

  if (!archiving && account.parentAccountId) {
    const parent = accounts.find(candidate => candidate.id === account.parentAccountId);
    if (parent && isAccountArchived(parent)) {
      return {
        title: AppConfig.strings.accounts.archive.parentArchivedTitle,
        message: AppConfig.strings.accounts.archive.parentArchivedMessage(parent.name),
        confirmText: AppConfig.strings.accounts.archive.unarchiveParent,
        cancelText: AppConfig.strings.accounts.archive.thisAccountOnly,
        onConfirm: () => intent.openCascade(false, parent.id),
        onCancel: () => void intent.commitArchive([accountId], false),
      };
    }
  }

  return 'default';
}

export function runArchiveIntentWithConfirmation(intent: ArchiveIntent) {
  const specialConfirm = resolveArchiveConfirmOptions(intent);
  if (specialConfirm === null) return;
  if (specialConfirm === 'default') {
    showArchiveIntentConfirmation(intent.archiving, intent.proceed);
    return;
  }
  confirm.show(specialConfirm);
}
