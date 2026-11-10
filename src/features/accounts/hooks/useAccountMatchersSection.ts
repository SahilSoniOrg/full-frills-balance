import type { AccountMatcherProposal, AccountMatcherSnapshot } from '@/src/types/accountMatcher';
import { observeAccountMatcherSnapshots } from '@/src/services/accounts/accountMatcherPreviewQueries';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useObservable } from '@/src/hooks/useObservable';
import { setAccountMatcherEnabled } from '@/src/services/accounts/accountMatcherCommands';
import type { AccountId } from '@/src/types/ids';
import { toast } from '@/src/utils/alerts';
import { useCallback, useState } from 'react';
import type { AccountMatchersSectionModel } from './details/types';
import { useAccountMatcherManagementViewModel } from './useAccountMatcherManagementViewModel';

const INITIAL_SUGGESTIONS = 1;

export type { AccountMatchersSectionModel } from './details/types';

/** Owns matcher snapshots, discovery, and toggle writes for the account details section. */
export function useAccountMatchersSection(accountId: AccountId): AccountMatchersSectionModel {
  const { workplaceId } = useWorkplace();
  const { data: matchers, version: matcherVersion } = useObservable(
    () => observeAccountMatcherSnapshots(workplaceId, accountId),
    [accountId, workplaceId],
    [] as AccountMatcherSnapshot[],
    { resetKey: JSON.stringify([workplaceId, accountId]) },
  );
  const management = useAccountMatcherManagementViewModel(accountId, matchers, matcherVersion);
  const [hiddenForVisit, setHiddenForVisit] = useState<Set<string>>(() => new Set());
  const [actionProposal, setActionProposal] = useState<AccountMatcherProposal | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [toggleError, setToggleError] = useState(false);

  const proposals = management.proposals
    .filter(proposal => !hiddenForVisit.has(proposal.proposalKey))
    .sort(
      (left, right) =>
        right.supportJournalIds.length - left.supportJournalIds.length ||
        right.examples.length - left.examples.length ||
        left.proposalKey.localeCompare(right.proposalKey),
    );
  const visibleProposals = showAll ? proposals : proposals.slice(0, INITIAL_SUGGESTIONS);

  const changeEnabled = useCallback(
    async (matcherId: string, isEnabled: boolean) => {
      try {
        setToggleError(false);
        await setAccountMatcherEnabled(workplaceId, matcherId, isEnabled);
      } catch {
        setToggleError(true);
        toast.error(copy.saveError);
      }
    },
    [workplaceId],
  );

  return {
    matchers,
    management,
    proposals,
    visibleProposals,
    initialSuggestions: INITIAL_SUGGESTIONS,
    actionProposal,
    setActionProposal,
    showAll,
    setShowAll,
    showDismissed,
    setShowDismissed,
    hideProposalForVisit: (proposalKey: string) =>
      setHiddenForVisit(previous => new Set(previous).add(proposalKey)),
    changeEnabled,
    toggleError,
  };
}
