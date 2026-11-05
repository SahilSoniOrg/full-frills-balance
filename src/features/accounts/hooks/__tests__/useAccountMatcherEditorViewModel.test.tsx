import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  AccountType,
  InboxParseStatus,
  InboxProcessingStatus,
  TransactionDirection,
} from '@/src/types/enums';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import type {
  AccountMatcherPreviewData,
  AccountMatcherPreviewMessage,
} from '@/src/services/accounts/accountMatcherPreviewQueries';
import {
  readLatestAccountMatcherMessages,
  readOlderAccountMatcherMessages,
} from '@/src/services/accounts/accountMatcherOlderMessages';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import { useAccountMatcherEditorViewModel } from '../useAccountMatcherEditorViewModel';
import {
  AccountMatcherProposalUnavailableError,
  saveAccountMatcher,
} from '@/src/services/accounts/accountMatcherCommands';
import { loadAccountMatcherPreviewData } from '@/src/services/accounts/accountMatcherPreviewQueries';
import { projectAccountMatcherDiscovery } from '@/src/services/accounts/accountMatcherDiscoveryQueries';
import { smsSyncPipeline } from '@/src/services/sms/pipeline/smsSyncPipeline';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'workplace-1' }),
}));
jest.mock('@/src/contexts/PrivacyScope', () => ({ useEffectivePrivacyMode: () => false }));
jest.mock('@/src/navigation/boundWorkplace', () => ({
  useBoundWorkplaceSaveGate: () => ({ workplaceId: 'workplace-1', assertBound: jest.fn() }),
}));
jest.mock('@/src/services/accounts/accountMatcherCommands', () => {
  class AccountMatcherConflictError extends Error {
    constructor() {
      super('Another matcher already has these conditions');
      this.name = 'AccountMatcherConflictError';
    }
  }
  class AccountMatcherProposalUnavailableError extends Error {
    constructor() {
      super('Account matcher evidence is no longer available');
      this.name = 'AccountMatcherProposalUnavailableError';
    }
  }
  return {
    AccountMatcherConflictError,
    AccountMatcherProposalUnavailableError,
    saveAccountMatcher: jest.fn().mockResolvedValue({ id: 'matcher-1' }),
    forgetAccountMatcher: jest.fn(),
  };
});
jest.mock('@/src/services/accounts/accountMatcherPreviewQueries', () => ({
  loadAccountMatcherPreviewData: jest.fn(),
}));
jest.mock('@/src/services/accounts/accountMatcherOlderMessages', () => ({
  readLatestAccountMatcherMessages: jest.fn(),
  readOlderAccountMatcherMessages: jest.fn(),
}));
jest.mock('@/src/services/accounts/accountMatcherDiscoveryQueries', () => ({
  loadAccountMatcherDiscovery: jest.fn(),
  projectAccountMatcherDiscovery: jest.fn(),
}));
jest.mock('@/src/services/sms/pipeline/smsSyncPipeline', () => ({
  smsSyncPipeline: { scanInbox: jest.fn(), scanMessages: jest.fn() },
}));
jest.mock('@/src/services/journal/JournalPersistenceService', () => ({
  journalPersistenceService: {
    put: jest.fn(),
    putAndLinkInboxRecord: jest.fn(),
    putMany: jest.fn(),
  },
}));

const accountId = asAccountId('account-1');
const previewData: AccountMatcherPreviewData = {
  accounts: [
    { id: accountId, name: 'Main card', accountType: AccountType.ASSET, currencyCode: 'USD' },
  ],
  messages: [],
  matchers: [],
  evidence: [],
  comparisonMessages: [],
  latestLinkTime: 0,
  journalsById: new Map(),
  journalIds: [],
  inspectedCount: 0,
  inspectedDates: null,
  recentRecognitions: [],
};

describe('useAccountMatcherEditorViewModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadAccountMatcherPreviewData).mockResolvedValue(previewData);
  });

  it('validates and saves a manual matcher without scanning SMS or writing journals', async () => {
    const { result } = renderHook(() => useAccountMatcherEditorViewModel(accountId));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isValid).toBe(false);
    await expect(result.current.save()).resolves.toBe('invalid');
    expect(saveAccountMatcher).not.toHaveBeenCalled();

    act(() => result.current.setSender('BANKXYZ'));
    expect(result.current.isValid).toBe(true);
    expect(result.current.definition).toEqual({
      version: 1,
      sender: { op: 'contains', value: 'BANKXYZ' },
    });

    await act(async () => {
      await expect(result.current.save()).resolves.toBe('saved');
    });

    expect(saveAccountMatcher).toHaveBeenCalledWith(
      asWorkplaceId('workplace-1'),
      expect.objectContaining({ accountId, provenance: 'manual' }),
    );
    expect(smsSyncPipeline.scanInbox).not.toHaveBeenCalled();
    expect(smsSyncPipeline.scanMessages).not.toHaveBeenCalled();
    expect(journalPersistenceService.put).not.toHaveBeenCalled();
    expect(journalPersistenceService.putAndLinkInboxRecord).not.toHaveBeenCalled();
    expect(journalPersistenceService.putMany).not.toHaveBeenCalled();
  });

  it('changes the canonical draft fingerprint when regex mode or pattern changes', async () => {
    const { result } = renderHook(() => useAccountMatcherEditorViewModel(accountId));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const initial = result.current.draftFingerprint;
    act(() => result.current.setRegexMode(true));
    const regex = result.current.draftFingerprint;
    expect(regex).not.toBe(initial);
    act(() => result.current.changeRegexPattern('card.*1234'));
    expect(result.current.draftFingerprint).not.toBe(regex);
    expect(result.current.definition.body).toEqual({ kind: 'regex', pattern: 'card.*1234' });
  });

  it('saves a flow declaration and returns Either to the legacy definition', async () => {
    const { result } = renderHook(() => useAccountMatcherEditorViewModel(accountId));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.flow).toBe('either');
    act(() => result.current.setSender('BANKXYZ'));
    const eitherFingerprint = result.current.draftFingerprint;
    act(() => result.current.setFlow('outgoing'));
    expect(result.current.draftFingerprint).not.toBe(eitherFingerprint);
    expect(result.current.definition.flow).toBe('outgoing');
    await act(async () => {
      await expect(result.current.save()).resolves.toBe('saved');
    });
    expect(saveAccountMatcher).toHaveBeenCalledWith(
      asWorkplaceId('workplace-1'),
      expect.objectContaining({ definition: expect.objectContaining({ flow: 'outgoing' }) }),
    );
    act(() => result.current.setFlow('either'));
    expect(result.current.definition).not.toHaveProperty('flow');
    expect(result.current.draftFingerprint).toBe(eitherFingerprint);
  });

  it('resets the draft when opening a different account', async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: typeof accountId }) => useAccountMatcherEditorViewModel(id),
      { initialProps: { id: accountId } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      result.current.setFlow('incoming');
      result.current.setSender('BANKXYZ');
      result.current.setFragmentsText('card ending');
      result.current.setRegexMode(true);
      result.current.changeRegexPattern('card.*1234');
    });
    rerender({ id: asAccountId('account-2') });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.flow).toBe('either');
    expect(result.current.sender).toBe('');
    expect(result.current.fragmentsText).toBe('');
    expect(result.current.regexMode).toBe(false);
    expect(result.current.regexPattern).toBe('');
  });

  it('validates safe regex immediately and saves a regex body through saveAccountMatcher', async () => {
    const { result } = renderHook(() => useAccountMatcherEditorViewModel(accountId));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setRegexMode(true));
    expect(result.current.regexMode).toBe(true);
    expect(result.current.isValid).toBe(false);

    act(() => result.current.changeRegexPattern('(a+)+$'));
    expect(result.current.regexValidation.valid).toBe(false);
    expect(result.current.isValid).toBe(false);
    await expect(result.current.save()).resolves.toBe('invalid');
    expect(saveAccountMatcher).not.toHaveBeenCalled();

    act(() => result.current.changeRegexPattern('^card[ -]ending.{0,4}1234$'));
    expect(result.current.regexValidation.valid).toBe(true);
    expect(result.current.isValid).toBe(true);
    expect(result.current.definition).toEqual({
      version: 1,
      body: { kind: 'regex', pattern: '^card[ -]ending.{0,4}1234$' },
    });

    await act(async () => {
      await expect(result.current.save()).resolves.toBe('saved');
    });
    expect(saveAccountMatcher).toHaveBeenCalledWith(
      asWorkplaceId('workplace-1'),
      expect.objectContaining({
        accountId,
        provenance: 'manual',
        definition: {
          version: 1,
          body: { kind: 'regex', pattern: '^card[ -]ending.{0,4}1234$' },
        },
      }),
    );
  });

  it('previews selected phrases and saves them as a selected-message matcher', async () => {
    const message: AccountMatcherPreviewMessage = {
      id: 'sms-1',
      workplaceId: asWorkplaceId('workplace-1'),
      channel: 'sms',
      deviceSourceId: 'device-sms-1',
      senderAddress: 'BANKXYZ',
      rawBody: 'Card ending 1234',
      inputDate: 1_800_000_000_000,
      inputFingerprint: 'fingerprint',
      parseStatus: InboxParseStatus.PARSED,
      direction: TransactionDirection.UNKNOWN,
      processingStatus: InboxProcessingStatus.PENDING,
      firstSeenAt: 1_800_000_000_000,
      lastScannedAt: 1_800_000_000_000,
      linkedAccountIds: [],
      linkedAccountNames: [],
    };
    jest.mocked(loadAccountMatcherPreviewData).mockResolvedValue({
      ...previewData,
      messages: [message],
    });
    const { result } = renderHook(() => useAccountMatcherEditorViewModel(accountId));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setFlow('incoming'));
    act(() => result.current.selectMessage(message));
    expect(result.current.flow).toBe('incoming');
    expect(result.current.sender).toBe('BANKXYZ');
    act(() => result.current.changeSelectedSpans([{ start: 0, end: 4 }]));
    expect(result.current.fragments).toEqual(['Card']);
    expect(result.current.supportingExamples).toHaveLength(1);
    expect(result.current.supportingExamples[0].spans).toEqual([{ start: 0, end: 4 }]);

    await act(async () => {
      await expect(result.current.save()).resolves.toBe('saved');
    });
    expect(saveAccountMatcher).toHaveBeenCalledWith(
      asWorkplaceId('workplace-1'),
      expect.objectContaining({
        accountId,
        provenance: 'selected_message',
        definition: {
          version: 1,
          flow: 'incoming',
          sender: { op: 'contains', value: 'BANKXYZ' },
          body: { kind: 'fragments', fragments: ['Card'] },
        },
      }),
    );
  });

  it('uses an older device message in memory to configure a matcher without inbox or journal writes', async () => {
    const olderMessage: AccountMatcherPreviewMessage = {
      id: 'android-sms:42',
      workplaceId: asWorkplaceId('workplace-1'),
      channel: 'sms',
      deviceSourceId: '42',
      senderAddress: 'BANKXYZ',
      rawBody: 'Card ending 1234',
      inputDate: 1_700_000_000_000,
      inputFingerprint: 'android-picker:42',
      parseStatus: InboxParseStatus.PARSED,
      direction: TransactionDirection.UNKNOWN,
      processingStatus: InboxProcessingStatus.PENDING,
      firstSeenAt: 1_700_000_000_000,
      lastScannedAt: 1_700_000_000_000,
      linkedAccountIds: [],
      linkedAccountNames: [],
    };
    jest.mocked(readLatestAccountMatcherMessages).mockResolvedValue({
      messages: [olderMessage],
      nextCursor: { date: olderMessage.inputDate, id: olderMessage.deviceSourceId },
      hasMore: false,
    });
    const { result } = renderHook(() => useAccountMatcherEditorViewModel(accountId));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => result.current.loadOlderMessages());

    expect(readLatestAccountMatcherMessages).toHaveBeenCalledWith(asWorkplaceId('workplace-1'));
    expect(result.current.olderMessages).toEqual([olderMessage]);
    expect(result.current.messages).toEqual([]);

    act(() => result.current.selectMessage(olderMessage));
    act(() => result.current.changeSelectedSpans([{ start: 0, end: 4 }]));
    expect(result.current.messages).toEqual([olderMessage]);
    expect(result.current.supportingExamples).toHaveLength(1);

    await act(async () => {
      await expect(result.current.save()).resolves.toBe('saved');
    });

    expect(saveAccountMatcher).toHaveBeenCalledWith(
      asWorkplaceId('workplace-1'),
      expect.objectContaining({
        accountId,
        provenance: 'selected_message',
        definition: expect.objectContaining({ body: { kind: 'fragments', fragments: ['Card'] } }),
      }),
    );
    expect(readOlderAccountMatcherMessages).not.toHaveBeenCalled();
    expect(smsSyncPipeline.scanInbox).not.toHaveBeenCalled();
    expect(smsSyncPipeline.scanMessages).not.toHaveBeenCalled();
    expect(journalPersistenceService.put).not.toHaveBeenCalled();
    expect(journalPersistenceService.putAndLinkInboxRecord).not.toHaveBeenCalled();
    expect(journalPersistenceService.putMany).not.toHaveBeenCalled();
  });

  it('prefills a linked-history proposal and revalidates it when confirmed', async () => {
    const message: AccountMatcherPreviewMessage = {
      id: 'proposal-sms-1',
      workplaceId: asWorkplaceId('workplace-1'),
      channel: 'sms',
      deviceSourceId: 'device-proposal-1',
      senderAddress: 'VM-BANKXYZ-S',
      rawBody: 'Card ending 1234',
      inputDate: 1_800_000_000_000,
      inputFingerprint: 'proposal-fingerprint',
      parseStatus: InboxParseStatus.PARSED,
      direction: TransactionDirection.UNKNOWN,
      processingStatus: InboxProcessingStatus.AUTO_POSTED,
      linkedJournalId: 'journal-1' as never,
      firstSeenAt: 1_800_000_000_000,
      lastScannedAt: 1_800_000_000_000,
      linkedAccountIds: [accountId],
      linkedAccountNames: ['Main card'],
    };
    const definition = {
      version: 1 as const,
      flow: 'incoming' as const,
      sender: { op: 'contains' as const, value: 'BANKXYZ' },
      body: { kind: 'fragments' as const, fragments: ['Card ending', '1234'] },
    };
    const proposal = {
      proposalKey: 'conditions-key-1',
      accountId,
      definition,
      examples: [{ message, provenance: 'auto_posted' as const }],
      supportJournalIds: ['journal-1'],
      overlaps: [],
      allExamplesAutoPosted: true,
    };
    jest.mocked(loadAccountMatcherPreviewData).mockResolvedValue(previewData);
    jest.mocked(projectAccountMatcherDiscovery).mockReturnValue({
      evidence: [message],
      comparisonMessages: [message],
      latestLinkTime: message.inputDate,
      proposals: [proposal],
      suppressedProposals: [],
      matchers: [],
      suppressions: [],
    });

    const { result } = renderHook(() =>
      useAccountMatcherEditorViewModel(accountId, undefined, proposal.proposalKey),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sender).toBe('BANKXYZ');
    expect(result.current.flow).toBe('incoming');
    expect(result.current.fragments).toEqual(['Card ending', '1234']);
    expect(result.current.proposal?.proposalKey).toBe(proposal.proposalKey);
    expect(result.current.selectedExample?.id).toBe(message.id);
    expect(result.current.selectedSpans).toEqual([
      { start: 0, end: 11 },
      { start: 12, end: 16 },
    ]);
    // Word edits preserve original source text; display placeholders never become conditions.
    act(() =>
      result.current.changeSelectedSpans([
        { start: 0, end: 4 },
        { start: 12, end: 16 },
      ]),
    );
    expect(result.current.definition.body).toEqual({
      kind: 'fragments',
      fragments: ['Card', '1234'],
    });
    act(() => result.current.setFragmentsText('Card ending\n1234'));
    expect(result.current.selectedSpans).toEqual([
      { start: 0, end: 11 },
      { start: 12, end: 16 },
    ]);

    expect(result.current.supportingExamples.map(example => example.message.id)).toEqual([
      'proposal-sms-1',
    ]);
    await act(async () => {
      await expect(result.current.save()).resolves.toBe('saved');
    });
    expect(saveAccountMatcher).toHaveBeenCalledWith(asWorkplaceId('workplace-1'), {
      accountId,
      definition,
      proposalKey: proposal.proposalKey,
      provenance: 'discovered',
    });
  });

  it('maps an unavailable proposal by error type', async () => {
    const { result } = renderHook(() => useAccountMatcherEditorViewModel(accountId));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setSender('BANKXYZ'));

    jest
      .mocked(saveAccountMatcher)
      .mockRejectedValueOnce(new Error('Account matcher evidence is no longer available'));
    await act(async () => {
      await expect(result.current.save()).resolves.toBe('error');
    });
    expect(result.current.saveError).toBe(copy.saveError);

    jest
      .mocked(saveAccountMatcher)
      .mockRejectedValueOnce(new AccountMatcherProposalUnavailableError());
    await act(async () => {
      await expect(result.current.save()).resolves.toBe('error');
    });
    expect(result.current.saveError).toBe(copy.proposalUnavailable);
  });
});
