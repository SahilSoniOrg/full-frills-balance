import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { AccountMatchersSection } from '../AccountMatchersSection';
import { useAccountMatcherManagementViewModel } from '@/src/features/accounts/hooks/useAccountMatcherManagementViewModel';
import { AppNavigation } from '@/src/utils/navigation';
import { asAccountId } from '@/src/types/ids';
import type {
  AccountMatcherProposal,
  SuppressedAccountMatcherProposal,
} from '@/src/services/sms/recognition/accountMatcherDiscovery';

jest.mock('@/src/hooks/useObservable', () => ({
  useObservable: () => ({ data: [], isLoading: false, error: null, version: 0, retry: jest.fn() }),
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'matcher-section-wp' }),
}));
jest.mock('@/src/features/accounts/hooks/useAccountMatcherManagementViewModel', () => ({
  useAccountMatcherManagementViewModel: jest.fn(),
}));
jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: { toAccountMatcherEditor: jest.fn() },
}));

const accountId = asAccountId('section-account');
const proposal: AccountMatcherProposal = {
  proposalKey: 'proposal-key',
  accountId,
  definition: {
    version: 1,
    sender: { op: 'contains', value: 'BANKXYZ' },
    body: { kind: 'fragments', fragments: ['Card ending', '1234'] },
  },
  examples: [
    { message: { id: 'sms-1' } as never, provenance: 'created_or_reviewed' },
    { message: { id: 'sms-2' } as never, provenance: 'auto_posted' },
  ],
  supportJournalIds: ['journal-1', 'journal-2'],
  overlaps: [],
  allExamplesAutoPosted: false,
};
const suppressed: SuppressedAccountMatcherProposal = {
  ...proposal,
  proposalKey: 'suppressed-key',
  suppression: { accountId, conditionsKey: 'suppressed-key', reason: 'forgotten' },
};
const discovery = {
  proposals: [proposal],
  suppressedProposals: [suppressed],
  isLoading: false,
  error: null,
  byMatcherId: new Map(),
  inspectedCount: 0,
  inspectedDates: null,
  recognitions: [],
  retry: jest.fn(),
  latestLinkTime: 0,
  refresh: jest.fn(),
  dismiss: jest.fn(),
  restore: jest.fn(),
};

describe('AccountMatchersSection proposals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useAccountMatcherManagementViewModel).mockReturnValue(discovery as never);
  });

  it('opens a proposal in the matcher editor and hides it for the current visit', () => {
    render(<AccountMatchersSection accountId={accountId} eligible />);

    expect(screen.getByText('BANKXYZ')).toBeTruthy();
    expect(screen.getByText('Card ending … 1234')).toBeTruthy();
    expect(screen.getByText('2 linked messages · 2 journals')).toBeTruthy();
    fireEvent.press(screen.getByTestId('account-matcher-proposal-0'));
    expect(AppNavigation.toAccountMatcherEditor).toHaveBeenCalledWith(
      accountId,
      undefined,
      proposal.proposalKey,
    );

    fireEvent.press(screen.getByTestId('account-matcher-proposal-actions-0'));
    fireEvent.press(screen.getByText('Not now'));
    expect(screen.queryByTestId('account-matcher-proposal-0')).toBeNull();
  });

  it('persists dismissals and exposes a restore action for suppressed candidates', () => {
    render(<AccountMatchersSection accountId={accountId} eligible />);
    fireEvent.press(screen.getByTestId('account-matcher-proposal-actions-0'));
    fireEvent.press(screen.getByText('Dismiss'));
    expect(discovery.dismiss).toHaveBeenCalledWith(proposal.proposalKey);
    fireEvent.press(screen.getByTestId('account-matcher-suppressed-title'));
    fireEvent.press(screen.getByTestId('account-matcher-suppressed-proposal-0'));
    expect(discovery.restore).toHaveBeenCalledWith(suppressed.proposalKey);
  });

  it('shows only the best-supported suggestion until Show more is opened', () => {
    const frequent: AccountMatcherProposal = {
      ...proposal,
      proposalKey: 'most-used',
      definition: { version: 1, sender: { op: 'contains', value: 'FREQUENTBANK' } },
      supportJournalIds: ['j-1', 'j-2', 'j-3'],
    };
    jest.mocked(useAccountMatcherManagementViewModel).mockReturnValue({
      ...discovery,
      proposals: [proposal, frequent],
      suppressedProposals: [],
    });
    render(<AccountMatchersSection accountId={accountId} eligible />);
    expect(screen.getByText('FREQUENTBANK')).toBeTruthy();
    expect(screen.queryByText('BANKXYZ')).toBeNull();
    fireEvent.press(screen.getByTestId('account-matcher-more-suggestions'));
    expect(screen.getByText('BANKXYZ')).toBeTruthy();
  });
});
