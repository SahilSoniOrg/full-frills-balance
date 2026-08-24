import type { ScreenHeaderActionItem } from '@/src/components/common/ScreenHeaderActions';
import type { AccountArchiveCascadeModalProps } from '@/src/features/accounts/components/AccountArchiveCascadeModal';
import { runArchiveIntentWithConfirmation } from '@/src/features/accounts/helpers/accountArchiveConfirm';
import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccountActions';
import { isSystemAccount } from '@/src/services/accounts/accountSystemAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import {
  buildArchiveCascadeNodes,
  isAccountArchived,
  type AccountArchiveChanges,
} from '@/src/utils/accountArchive';
import { showErrorAlert, toast } from '@/src/utils/alerts';
import { useCallback, useMemo, useState } from 'react';

export type UseAccountArchiveActionArgs = {
  enabled: boolean;
  workplaceId?: WorkplaceId;
  accountId?: AccountId;
  account?: AccountFields | null;
  accounts: AccountFields[];
};

export function useAccountArchiveAction({
  enabled,
  workplaceId: workplaceIdProp,
  accountId,
  account,
  accounts,
}: UseAccountArchiveActionArgs) {
  const { workplaceId: contextWorkplaceId } = useWorkplace();
  const workplaceId = workplaceIdProp ?? contextWorkplaceId;
  const { theme } = useTheme();
  const { applyArchiveChanges } = useAccountActions(workplaceId);
  const [isApplying, setIsApplying] = useState(false);
  const [cascadeState, setCascadeState] = useState<{
    archiving: boolean;
    rootId: AccountId;
  } | null>(null);

  const isActive = enabled && !!accountId && !!account;
  const isArchived = account ? isAccountArchived(account) : false;
  const cascadeNodes = useMemo(
    () => (accountId ? buildArchiveCascadeNodes(accountId, accounts) : []),
    [accountId, accounts],
  );
  const hasDescendants = cascadeNodes.length > 1;

  const commitArchive = useCallback(
    async (ids: AccountId[], archiving: boolean) => {
      if (!account) return;

      const changes: AccountArchiveChanges = archiving
        ? { toArchive: ids, toUnarchive: [] }
        : { toArchive: [], toUnarchive: ids };

      setIsApplying(true);
      try {
        const applied = await applyArchiveChanges(changes);
        if (!applied) return;

        toast.success(
          archiving
            ? AppConfig.strings.accounts.archive.archivedSuccess(account.name)
            : AppConfig.strings.accounts.archive.unarchivedSuccess(account.name),
        );
      } catch (error) {
        showErrorAlert(
          error,
          archiving
            ? AppConfig.strings.accounts.archive.archiveFailed
            : AppConfig.strings.accounts.archive.unarchiveFailed,
        );
      } finally {
        setIsApplying(false);
      }
    },
    [account, applyArchiveChanges],
  );

  const openCascade = useCallback((archiving: boolean, rootId: AccountId) => {
    setCascadeState({ archiving, rootId });
  }, []);

  const closeCascade = useCallback(() => {
    setCascadeState(null);
  }, []);

  const runArchiveIntent = useCallback(
    (archiving: boolean) => {
      if (!account || !accountId) return;

      const proceed = () => {
        if (hasDescendants) {
          openCascade(archiving, accountId);
          return;
        }
        void commitArchive([accountId], archiving);
      };

      runArchiveIntentWithConfirmation({
        archiving,
        account,
        accountId,
        accounts,
        hasDescendants,
        proceed,
        openCascade,
        commitArchive,
      });
    },
    [account, accountId, accounts, commitArchive, hasDescendants, openCascade],
  );

  const onPress = useCallback(() => {
    runArchiveIntent(!isArchived);
  }, [isArchived, runArchiveIntent]);

  const headerActionItems = useMemo((): ScreenHeaderActionItem[] => {
    if (!isActive) return [];

    return [
      {
        name: 'archive',
        onPress,
        variant: 'surface',
        iconColor: isArchived ? theme.primary : theme.textSecondary,
        disabled: isApplying,
        testID: 'archive-account-button',
        accessibilityLabel: isArchived
          ? AppConfig.strings.accounts.archive.unarchiveAccount
          : AppConfig.strings.accounts.archive.archiveAccount,
      },
    ];
  }, [isActive, isApplying, isArchived, onPress, theme.primary, theme.textSecondary]);

  const archiveCascadeModal = useMemo((): AccountArchiveCascadeModalProps | null => {
    if (cascadeState == null) return null;

    return {
      visible: true,
      archiving: cascadeState.archiving,
      rootAccountId: cascadeState.rootId,
      allAccounts: accounts,
      onClose: closeCascade,
      onConfirm: selectedIds => {
        void commitArchive(selectedIds, cascadeState.archiving);
        closeCascade();
      },
    };
  }, [accounts, cascadeState, closeCascade, commitArchive]);

  return {
    headerActionItems,
    archiveCascadeModal,
    runArchiveIntent,
    isSystemAccount: account ? isSystemAccount(account) : false,
  };
}
