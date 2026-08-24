import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useAccountBalances, useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import type { AccountFields } from '@/src/types/plainDtos';
import type { AccountId } from '@/src/types/ids';
import { isBalanceSheetAccount } from '@/src/utils/accountCategory';
import { AppNavigation } from '@/src/utils/navigation';
import { confirm, toast } from '@/src/utils/alerts';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createAccountTreeDraft,
  discardAccountTreeDraft,
  getAccountTreeDraftPlacementChanges,
  getAccountTreeSubtreeMovePreview,
  isAccountTreeDraftDirty,
  stageAccountTreeDraftDrop,
  type AccountTreeDraft,
} from '@/src/services/accounts/accountTreeDraft';
import {
  createAccountTreeSnapshot,
  type AccountTreeRowState,
} from '@/src/services/accounts/accountTree';
import { saveAccountTreeDraft } from '@/src/services/accounts/accountHierarchyCommands';
import type { AccountTreeDropTarget } from '@/src/services/accounts/accountTreeTargets';
import { flattenAccountTree } from '@/src/services/accounts/accountTreeProjection';

function toBaselineRows(accounts: readonly AccountFields[]): AccountTreeRowState[] {
  return accounts.map(account => ({
    accountId: account.id,
    accountType: account.accountType,
    parentAccountId: account.parentAccountId || undefined,
    orderNum: account.orderNum ?? 0,
  }));
}

export function useAccountManagementViewModel() {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const { accounts, isLoading } = useAccounts(workplaceId);
  const { balancesByAccountId } = useAccountBalances(workplaceId, accounts, defaultCurrencyCode);
  const { accountId: initialFocusedId, filterMode = 'accounts' } = useLocalSearchParams<{
    accountId?: AccountId;
    filterMode?: 'accounts' | 'categories';
  }>();
  const navigation = useNavigation();
  const [selectedAccountId, setSelectedAccountId] = useState<AccountId | null>(null);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<AccountId>>(new Set());
  const [collapsedAccountTypes, setCollapsedAccountTypes] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<AccountTreeDraft<AccountFields>>(() =>
    createAccountTreeDraft([]),
  );
  const draftRef = useRef(draft);
  const pendingLeaveActionRef = useRef<(() => void) | null>(null);
  const pendingLeavePromptRef = useRef<(() => void) | null>(null);
  const [isLeavingAfterDiscard, setIsLeavingAfterDiscard] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const sourceModeAccounts = useMemo(
    () =>
      accounts.filter(account =>
        filterMode === 'categories'
          ? !isBalanceSheetAccount(account.accountType)
          : isBalanceSheetAccount(account.accountType),
      ),
    [accounts, filterMode],
  );

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    setDraft(current => {
      if (isAccountTreeDraftDirty(current)) return current;
      const next = createAccountTreeDraft(sourceModeAccounts);
      draftRef.current = next;
      return next;
    });
  }, [sourceModeAccounts]);

  const allModeAccounts = draft.accounts;
  const treeSnapshot = useMemo(() => createAccountTreeSnapshot(allModeAccounts), [allModeAccounts]);
  const treeRows = useMemo(
    () => flattenAccountTree(treeSnapshot, { expandedAccountIds, collapsedAccountTypes }),
    [collapsedAccountTypes, expandedAccountIds, treeSnapshot],
  );
  const selectedAccount = selectedAccountId
    ? treeSnapshot.accountsById.get(selectedAccountId)
    : undefined;
  const parentCandidates = useMemo(() => {
    if (!selectedAccountId) return [];
    return treeSnapshot
      .getParentCandidates(selectedAccountId, {
        hasDirectTransactions: account => {
          const balance = balancesByAccountId.get(account.id);
          return balance == null || (balance.directTransactionCount || 0) > 0;
        },
      })
      .filter(candidate => candidate.id !== selectedAccount?.parentAccountId);
  }, [balancesByAccountId, selectedAccount?.parentAccountId, selectedAccountId, treeSnapshot]);
  const pendingState = useMemo(() => {
    const pendingAccountIds = new Set<AccountId>(draft.placementChanges.keys());
    const pendingPreviews = new Map<AccountId, string>();
    for (const operation of draft.operations) {
      pendingAccountIds.add(operation.accountId);
      treeSnapshot.getDescendants(operation.accountId).forEach(id => pendingAccountIds.add(id));
      const account = treeSnapshot.accountsById.get(operation.accountId);
      if (account) {
        pendingPreviews.set(
          operation.accountId,
          getAccountTreeSubtreeMovePreview(account.name, operation),
        );
      }
    }
    return { pendingAccountIds, pendingPreviews };
  }, [draft.operations, draft.placementChanges, treeSnapshot]);
  const isDraftDirty = isAccountTreeDraftDirty(draft);

  useEffect(() => {
    if (!initialFocusedId || allModeAccounts.length === 0) return;
    const expanded = new Set<AccountId>();
    let current = treeSnapshot.accountsById.get(initialFocusedId);
    while (current?.parentAccountId) {
      expanded.add(current.parentAccountId);
      current = treeSnapshot.accountsById.get(current.parentAccountId);
    }
    if (expanded.size > 0) {
      const frameId = requestAnimationFrame(() => {
        setExpandedAccountIds(previous => new Set([...previous, ...expanded]));
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [allModeAccounts.length, initialFocusedId, treeSnapshot]);

  const onDrop = useCallback((target: AccountTreeDropTarget) => {
    try {
      const next = stageAccountTreeDraftDrop(draftRef.current, target);
      draftRef.current = next;
      setDraft(next);
      if (target.parentId) {
        setExpandedAccountIds(previous => new Set([...previous, target.parentId!]));
      }
      setSelectedAccountId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to stage account move');
    }
  }, []);

  const onAssignParent = useCallback(
    (accountId: AccountId, parentId: AccountId | null) => {
      const currentAccounts = draftRef.current.accounts;
      const account = currentAccounts.find(candidate => candidate.id === accountId);
      if (!account) {
        toast.error('Account not found');
        return Promise.resolve();
      }
      if ((account.parentAccountId || undefined) === (parentId || undefined)) {
        setSelectedAccountId(null);
        return Promise.resolve();
      }
      const siblings = createAccountTreeSnapshot(currentAccounts).getChildren(
        parentId,
        account.accountType,
      );
      onDrop({
        accountId,
        parentId,
        siblingIndex: siblings.length,
        kind: parentId ? 'child' : 'outside',
        anchorAccountId: parentId || accountId,
      });
      return Promise.resolve();
    },
    [onDrop],
  );

  const onSaveDraft = useCallback(async () => {
    const current = draftRef.current;
    if (!isAccountTreeDraftDirty(current) || isSavingDraft) return;
    setIsSavingDraft(true);
    try {
      await saveAccountTreeDraft(
        workplaceId,
        toBaselineRows(current.baselineAccounts),
        getAccountTreeDraftPlacementChanges(current),
      );
      const committed = createAccountTreeDraft(current.accounts);
      draftRef.current = committed;
      setDraft(committed);
      toast.success('Account hierarchy saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save account hierarchy');
    } finally {
      setIsSavingDraft(false);
    }
  }, [isSavingDraft, workplaceId]);

  const onDiscardDraft = useCallback(() => {
    const discarded = discardAccountTreeDraft(draftRef.current);
    draftRef.current = discarded;
    setDraft(discarded);
  }, []);

  const discardThenLeave = useCallback(
    (action: () => void) => {
      onDiscardDraft();
      pendingLeaveActionRef.current = action;
      setIsLeavingAfterDiscard(true);
    },
    [onDiscardDraft],
  );

  useEffect(() => {
    if (!isLeavingAfterDiscard) return;
    const action = pendingLeaveActionRef.current;
    pendingLeaveActionRef.current = null;
    action?.();
  }, [isLeavingAfterDiscard]);

  const showDiscardChangesPrompt = useCallback(
    (leaveAction: () => void) => {
      confirm.show({
        title: 'Discard changes?',
        message: `Your ${draft.operations.length} staged ${draft.operations.length === 1 ? 'change has' : 'changes have'} not been saved.`,
        confirmText: 'Discard changes',
        cancelText: 'Keep editing',
        destructive: true,
        onConfirm: () => {
          discardThenLeave(leaveAction);
        },
      });
    },
    [discardThenLeave, draft.operations.length],
  );

  const requestDiscardChangesPrompt = useCallback(
    (leaveAction: () => void) => {
      // A root-level confirmation cannot sit above a native move sheet. Close
      // the sheet first, then present the confirmation from onDismiss.
      if (selectedAccountId) {
        pendingLeavePromptRef.current = leaveAction;
        setSelectedAccountId(null);
        return;
      }
      showDiscardChangesPrompt(leaveAction);
    },
    [selectedAccountId, showDiscardChangesPrompt],
  );

  const onMoveModalDismiss = useCallback(() => {
    const leaveAction = pendingLeavePromptRef.current;
    pendingLeavePromptRef.current = null;
    if (leaveAction) showDiscardChangesPrompt(leaveAction);
  }, [showDiscardChangesPrompt]);

  const requestLeave = useCallback(() => {
    if (!isDraftDirty) {
      AppNavigation.back();
      return;
    }
    requestDiscardChangesPrompt(AppNavigation.back);
  }, [isDraftDirty, requestDiscardChangesPrompt]);

  usePreventRemove(isDraftDirty && !isLeavingAfterDiscard, ({ data }) => {
    requestDiscardChangesPrompt(() => navigation.dispatch(data.action));
  });

  return {
    accounts: allModeAccounts,
    treeRows,
    isLoading,
    balancesByAccountId,
    selectedAccountId,
    selectedAccount,
    parentCandidates,
    accountsForArchiveToggle: allModeAccounts,
    filterMode,
    isOrganizing,
    isDraftDirty,
    isSavingDraft,
    pendingChangeCount: draft.operations.length,
    pendingAccountIds: pendingState.pendingAccountIds,
    pendingPreviews: pendingState.pendingPreviews,
    onDrop,
    onSaveDraft,
    onDiscardDraft,
    onAssignParent,
    onSelectAccount: setSelectedAccountId,
    onMoveModalDismiss,
    onToggleExpand: (id: AccountId) => {
      setExpandedAccountIds(previous => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    collapsedAccountTypes,
    onToggleTypeSection: (accountType: string) => {
      setCollapsedAccountTypes(previous => {
        const next = new Set(previous);
        if (next.has(accountType)) next.delete(accountType);
        else next.add(accountType);
        return next;
      });
    },
    onToggleOrganize: () => setIsOrganizing(current => !current),
    onCreateParent: () =>
      filterMode === 'categories'
        ? AppNavigation.toCategoryCreation('EXPENSE')
        : AppNavigation.toAccountCreation(),
    onBack: requestLeave,
  };
}
