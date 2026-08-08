import Account from '@/src/data/models/Account';
import { AccountArchiveCascadeModal } from '@/src/features/accounts/components/AccountArchiveCascadeModal';
import type { ScreenHeaderActionItem } from '@/src/components/common/ScreenHeaderActions';
import { ScreenHeaderActions } from '@/src/components/common/ScreenHeaderActions';
import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccountActions';
import { isSystemAccount } from '@/src/services/accounts/accountSystemAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import {
  buildArchiveCascadeNodes,
  isAccountArchived,
  type AccountArchiveChanges,
} from '@/src/utils/accountArchive';
import { confirm, showErrorAlert, toast } from '@/src/utils/alerts';
import { useCallback, useMemo, useState } from 'react';

type UseAccountArchiveActionArgs = {
  enabled: boolean;
  workplaceId?: WorkplaceId;
  accountId?: AccountId;
  account?: Account | null;
  accounts: Account[];
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
  // Parent observers bump useObservable version on field updates even when the
  // WatermelonDB model reference is stable — read archivedAt directly here.
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

      if (archiving && isSystemAccount(account)) {
        confirm.show({
          title: AppConfig.strings.accounts.archive.systemAccountTitle,
          message: AppConfig.strings.accounts.archive.systemAccountMessage,
          confirmText: AppConfig.strings.accounts.archive.archiveAnyway,
          onConfirm: proceed,
        });
        return;
      }

      if (!archiving && account.parentAccountId) {
        const parent = accounts.find(candidate => candidate.id === account.parentAccountId);
        if (parent && isAccountArchived(parent)) {
          confirm.show({
            title: AppConfig.strings.accounts.archive.parentArchivedTitle,
            message: AppConfig.strings.accounts.archive.parentArchivedMessage(parent.name),
            confirmText: AppConfig.strings.accounts.archive.unarchiveParent,
            cancelText: AppConfig.strings.accounts.archive.thisAccountOnly,
            onConfirm: () => openCascade(false, parent.id as AccountId),
            onCancel: () => void commitArchive([accountId], false),
          });
          return;
        }
      }

      proceed();
    },
    [account, accountId, accounts, commitArchive, hasDescendants, openCascade],
  );

  const onPress = useCallback(() => {
    runArchiveIntent(!isArchived);
  }, [isArchived, runArchiveIntent]);

  const headerActions = useMemo(() => {
    if (!isActive) return null;

    const action: ScreenHeaderActionItem = {
      name: 'archive',
      onPress,
      variant: 'surface',
      iconColor: isArchived ? theme.primary : theme.textSecondary,
      disabled: isApplying,
      testID: 'archive-account-button',
      accessibilityLabel: isArchived
        ? AppConfig.strings.accounts.archive.unarchiveAccount
        : AppConfig.strings.accounts.archive.archiveAccount,
    };

    return <ScreenHeaderActions actions={[action]} />;
  }, [isActive, isApplying, isArchived, onPress, theme.primary, theme.textSecondary]);

  const cascadeModal =
    cascadeState != null ? (
      <AccountArchiveCascadeModal
        visible
        archiving={cascadeState.archiving}
        rootAccountId={cascadeState.rootId}
        allAccounts={accounts}
        onClose={() => setCascadeState(null)}
        onConfirm={selectedIds => {
          void commitArchive(selectedIds, cascadeState.archiving);
          setCascadeState(null);
        }}
      />
    ) : null;

  return {
    headerActions,
    cascadeModal,
  };
}
