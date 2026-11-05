import type { ScreenNavChrome } from '@/src/components/layout';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import { AccountMatcherEditorView } from '@/src/features/accounts/components/AccountMatcherEditorView';
import { useAccountMatcherEditorViewModel } from '@/src/features/accounts/hooks/useAccountMatcherEditorViewModel';
import { useConfirmUnsavedChanges } from '@/src/hooks/useConfirmUnsavedChanges';
import { asAccountId, EMPTY_ACCOUNT_ID, type AccountId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { Icon } from '@/src/types/domainIcons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

export default function AccountMatcherEditorScreen() {
  const params = useLocalSearchParams<{
    accountId?: string | string[];
    matcherId?: string | string[];
    proposalKey?: string | string[];
  }>();
  const rawAccountId = Array.isArray(params.accountId) ? params.accountId[0] : params.accountId;
  const accountId = rawAccountId ? asAccountId(rawAccountId) : EMPTY_ACCOUNT_ID;
  const matcherId = Array.isArray(params.matcherId) ? params.matcherId[0] : params.matcherId;
  const proposalKey = Array.isArray(params.proposalKey)
    ? params.proposalKey[0]
    : params.proposalKey;
  return (
    <AccountMatcherEditor
      key={JSON.stringify([accountId, matcherId ?? null, proposalKey ?? null])}
      accountId={accountId}
      matcherId={matcherId}
      proposalKey={proposalKey}
    />
  );
}

function AccountMatcherEditor({
  accountId,
  matcherId,
  proposalKey,
}: {
  accountId: AccountId;
  matcherId?: string;
  proposalKey?: string;
}) {
  const vm = useAccountMatcherEditorViewModel(accountId, matcherId, proposalKey);
  const [overlapDraftKey, setOverlapDraftKey] = useState<string | null>(null);
  const [leaveAfterSave, setLeaveAfterSave] = useState<(() => void) | null>(null);

  const fingerprint = vm.draftFingerprint;
  const showOverlapWarning = overlapDraftKey === fingerprint;
  const guard = useConfirmUnsavedChanges({
    fingerprint,
    baselineReady: !vm.isLoading,
    disabled: vm.isSaving,
    leaveAfterSave,
    title: 'Discard matcher changes?',
  });

  const finish = useCallback(() => setLeaveAfterSave(() => AppNavigation.back), []);
  const handleSave = useCallback(async () => {
    const result = await vm.save();
    if (result === 'overlap') setOverlapDraftKey(fingerprint);
    if (result === 'saved') finish();
  }, [fingerprint, finish, vm]);
  const resolveOverlap = useCallback(
    async (resolution: { keepBoth?: boolean; moveMatcherId?: string }) => {
      if (!resolution.keepBoth && !resolution.moveMatcherId) {
        setOverlapDraftKey(null);
        return;
      }
      const result = await vm.save(resolution);
      if (result === 'saved') finish();
    },
    [finish, vm],
  );
  const handleForget = useCallback(async () => {
    if (await vm.forget()) finish();
  }, [finish, vm]);

  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: matcherId ? copy.editMatcher : copy.newMatcher,
      kind: 'nav',
      backIcon: Icon.Back,
      onBack: guard.onBack,
    }),
    [guard.onBack, matcherId],
  );

  return (
    <AccountMatcherEditorView
      vm={vm}
      chrome={chrome}
      showOverlapWarning={showOverlapWarning}
      onSave={handleSave}
      onResolveOverlap={resolution => void resolveOverlap(resolution)}
      onForget={handleForget}
    />
  );
}
