import { JournalStatus } from '@/src/types/enums';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import type {
  MovementMatchResult,
  MovementOccurrence,
} from '@/src/domain/planned-payment/sharedMovementMatcher';

import { applyEvidenceDrivenObservationSettlement } from '../evidenceDrivenObservationSettlement';

const mockDecideCapture = jest.fn();
const mockFindSharedMovementMatch = jest.fn();
const mockSettlePlannedOccurrence = jest.fn();
const mockFindActiveJournal = jest.fn();
const mockStageLinkedCaptureSource = jest.fn();
const mockJournalAlreadyHasCaptureSource = jest.fn();

jest.mock('@/src/domain/transaction-intelligence/decideCapture', () => ({
  decideCapture: (...args: unknown[]) => mockDecideCapture(...args),
}));

jest.mock('@/src/services/planned-payment/sharedMovementMatcher', () => ({
  createRepositorySharedMovementMatchLoader: jest.fn(() => ({ loadFacts: jest.fn() })),
  findSharedMovementMatch: (...args: unknown[]) => mockFindSharedMovementMatch(...args),
}));

jest.mock('@/src/services/planned-payment/plannedOccurrenceSettlement', () => ({
  settlePlannedOccurrence: (...args: unknown[]) => mockSettlePlannedOccurrence(...args),
}));

jest.mock('@/src/data/repositories/journal/journalPersistenceSupport', () => ({
  findActiveJournal: (...args: unknown[]) => mockFindActiveJournal(...args),
}));

jest.mock('@/src/data/repositories/journal/journalPlanAttachOperations', () => ({
  EVIDENCE_SETTLE_AUDIT_SOURCE: 'evidence_driven',
}));

jest.mock('@/src/data/repositories/journal/captureSourceLinkStaging', () => ({
  stageLinkedCaptureSource: (...args: unknown[]) => mockStageLinkedCaptureSource(...args),
  journalAlreadyHasCaptureSource: (...args: unknown[]) =>
    mockJournalAlreadyHasCaptureSource(...args),
}));

const occurrence = (overrides: Partial<MovementOccurrence> = {}): MovementOccurrence => ({
  id: 'planned-journal-1',
  planId: 'plan-1',
  status: 'active',
  date: 1_700_000_000_000,
  intervalDays: 30,
  amount: 100,
  currency: 'USD',
  accountId: 'bank',
  direction: 'debit',
  ...overrides,
});

const observation = {
  id: 'sms-1',
  channel: 'sms' as const,
  amount: 100,
  currency: 'USD',
  accountId: 'bank',
  direction: 'debit' as const,
  date: 1_700_000_100_000,
  reference: 'REF-99',
};

const gate = {
  observation: {
    source: {
      channel: 'sms' as const,
      sourceId: 'sms-1',
      occurredAt: observation.date,
      fingerprint: 'fp-1',
      merchant: 'Cafe',
    },
    direction: 'debit' as const,
    amount: 100,
    currencyCode: 'USD',
    merchant: 'Cafe',
    economicEvidence: 'purchase' as const,
    parsed: true,
    pending: true,
  },
  accounts: {
    status: 'recognized' as const,
    accountIds: ['bank' as AccountId],
    ambiguous: false,
  },
  policy: {
    enabled: true,
    enabledAt: 1,
    allowAutomaticCapture: true,
    sourceAccountCurrency: () => 'USD',
    isFinancialLeaf: () => true,
    uncategorizedAccount: () => 'uncat' as AccountId,
  },
  now: observation.date + 1_000,
};

const workplaceId = 'wp' as WorkplaceId;

const session = {} as never;

describe('applyEvidenceDrivenObservationSettlement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDecideCapture.mockReturnValue({ kind: 'post', journalData: {} });
    mockJournalAlreadyHasCaptureSource.mockResolvedValue(false);
    mockStageLinkedCaptureSource.mockResolvedValue(undefined);
  });

  it('passthrough when matcher finds nothing', async () => {
    mockFindSharedMovementMatch.mockResolvedValue({ kind: 'none' } satisfies MovementMatchResult);
    await expect(
      applyEvidenceDrivenObservationSettlement({
        session,
        workplaceId,
        observation,
        captureGate: gate,
        loader: { loadFacts: jest.fn() },
      }),
    ).resolves.toEqual({ kind: 'passthrough' });
    expect(mockSettlePlannedOccurrence).not.toHaveBeenCalled();
  });

  it('flags soft matches for review and blocks capture auto-post', async () => {
    mockFindSharedMovementMatch.mockResolvedValue({
      kind: 'soft',
      candidates: [occurrence()],
    } satisfies MovementMatchResult);
    await expect(
      applyEvidenceDrivenObservationSettlement({
        session,
        workplaceId,
        observation,
        captureGate: gate,
        loader: { loadFacts: jest.fn() },
      }),
    ).resolves.toMatchObject({
      kind: 'review',
      flagDuplicate: true,
      blockCaptureAutoPost: true,
      matchKind: 'soft',
    });
    expect(mockDecideCapture).not.toHaveBeenCalled();
    expect(mockSettlePlannedOccurrence).not.toHaveBeenCalled();
  });

  it('does not settle when decideCapture would not post', async () => {
    mockFindSharedMovementMatch.mockResolvedValue({
      kind: 'strictUnique',
      occurrence: occurrence(),
      silentAttach: false,
    } satisfies MovementMatchResult);
    mockDecideCapture.mockReturnValue({ kind: 'review', reason: 'needs account' });
    await expect(
      applyEvidenceDrivenObservationSettlement({
        session,
        workplaceId,
        observation,
        captureGate: gate,
        loader: { loadFacts: jest.fn() },
      }),
    ).resolves.toMatchObject({
      kind: 'review',
      flagDuplicate: false,
      blockCaptureAutoPost: true,
      matchKind: 'strictUnique',
    });
    expect(mockSettlePlannedOccurrence).not.toHaveBeenCalled();
  });

  it('posts a PLANNED occurrence via settlement when gate passes', async () => {
    mockFindSharedMovementMatch.mockResolvedValue({
      kind: 'strictUnique',
      occurrence: occurrence(),
      silentAttach: false,
    } satisfies MovementMatchResult);
    mockFindActiveJournal.mockResolvedValue({
      id: 'planned-journal-1',
      status: JournalStatus.PLANNED,
      plannedPaymentId: 'plan-1',
    });
    const journalResult = { journal: { id: 'planned-journal-1' } };
    mockSettlePlannedOccurrence.mockResolvedValue({ journal: journalResult });
    await expect(
      applyEvidenceDrivenObservationSettlement({
        session,
        workplaceId,
        observation,
        captureGate: gate,
        loader: { loadFacts: jest.fn() },
      }),
    ).resolves.toMatchObject({
      kind: 'settled',
      journalId: 'planned-journal-1',
      journalResult,
    });
    expect(mockSettlePlannedOccurrence).toHaveBeenCalledWith(
      session,
      'wp',
      'plan-1',
      occurrence().date,
      expect.objectContaining({
        kind: 'post',
        postedAt: observation.date,
        journalId: 'planned-journal-1',
        auditMetadata: expect.objectContaining({ source: 'evidence_driven' }),
      }),
    );
  });

  it('mints an ungenerated occurrence via settlement', async () => {
    const ungenerated = occurrence({ id: 'plan:plan-1:1700000000000' });
    mockFindSharedMovementMatch.mockResolvedValue({
      kind: 'strictUnique',
      occurrence: ungenerated,
      silentAttach: false,
    } satisfies MovementMatchResult);
    const journalResult = { journal: { id: 'minted-1' } };
    mockSettlePlannedOccurrence.mockResolvedValue({ journal: journalResult });
    await expect(
      applyEvidenceDrivenObservationSettlement({
        session,
        workplaceId,
        observation,
        captureGate: gate,
        loader: { loadFacts: jest.fn() },
      }),
    ).resolves.toMatchObject({ kind: 'settled', journalId: 'minted-1' });
    expect(mockSettlePlannedOccurrence).toHaveBeenCalledWith(
      session,
      'wp',
      'plan-1',
      ungenerated.date,
      expect.objectContaining({
        kind: 'post',
        postedAt: observation.date,
        auditMetadata: expect.objectContaining({ source: 'evidence_driven' }),
      }),
    );
  });

  it('silent-attaches a claiming POSTED occurrence without settling', async () => {
    mockFindSharedMovementMatch.mockResolvedValue({
      kind: 'strictUnique',
      occurrence: occurrence({ id: 'posted-1' }),
      silentAttach: true,
    } satisfies MovementMatchResult);
    mockFindActiveJournal.mockResolvedValue({
      id: 'posted-1',
      status: JournalStatus.POSTED,
      plannedPaymentId: 'plan-1',
    });
    await expect(
      applyEvidenceDrivenObservationSettlement({
        session,
        workplaceId,
        observation,
        captureGate: gate,
        loader: { loadFacts: jest.fn() },
      }),
    ).resolves.toMatchObject({
      kind: 'linked',
      journalId: 'posted-1',
      silentAttach: true,
    });
    expect(mockSettlePlannedOccurrence).not.toHaveBeenCalled();
    expect(mockStageLinkedCaptureSource).not.toHaveBeenCalled();
  });

  it('blocks same-channel second observations', async () => {
    mockFindSharedMovementMatch.mockResolvedValue({
      kind: 'reviewSameChannel',
      candidates: [occurrence()],
    } satisfies MovementMatchResult);
    await expect(
      applyEvidenceDrivenObservationSettlement({
        session,
        workplaceId,
        observation,
        captureGate: gate,
        loader: { loadFacts: jest.fn() },
      }),
    ).resolves.toMatchObject({
      kind: 'review',
      flagDuplicate: true,
      matchKind: 'reviewSameChannel',
    });
  });

  it('hard first-link stages capture source without decideCapture', async () => {
    mockFindSharedMovementMatch.mockResolvedValue({
      kind: 'hard',
      candidates: [
        {
          id: 'posted-ref-1',
          status: 'posted',
          amount: 100,
          currency: 'USD',
          accountId: 'bank',
          direction: 'debit',
          date: observation.date,
          reference: 'REF-99',
        },
      ],
    } satisfies MovementMatchResult);
    mockJournalAlreadyHasCaptureSource.mockResolvedValue(false);

    await expect(
      applyEvidenceDrivenObservationSettlement({
        session,
        workplaceId,
        observation,
        captureGate: gate,
        loader: { loadFacts: jest.fn() },
      }),
    ).resolves.toMatchObject({
      kind: 'linked',
      journalId: 'posted-ref-1',
      silentAttach: true,
      hardIdentity: true,
    });

    expect(mockDecideCapture).not.toHaveBeenCalled();
    expect(mockSettlePlannedOccurrence).not.toHaveBeenCalled();
    expect(mockJournalAlreadyHasCaptureSource).toHaveBeenCalledWith(
      'wp',
      'posted-ref-1',
      expect.objectContaining({
        channel: 'sms',
        sourceId: 'sms-1',
        fingerprint: 'fp-1',
        merchant: 'Cafe',
      }),
    );
    expect(mockStageLinkedCaptureSource).toHaveBeenCalledTimes(1);
    expect(mockStageLinkedCaptureSource).toHaveBeenCalledWith(
      session,
      'wp',
      'posted-ref-1',
      expect.objectContaining({
        channel: 'sms',
        sourceId: 'sms-1',
        fingerprint: 'fp-1',
        merchant: 'Cafe',
      }),
    );
  });

  it('hard already-linked is idempotent and does not stage again', async () => {
    mockFindSharedMovementMatch.mockResolvedValue({
      kind: 'hard',
      candidates: [
        {
          id: 'posted-ref-1',
          status: 'posted',
          amount: 100,
          currency: 'USD',
          accountId: 'bank',
          direction: 'debit',
          date: observation.date,
          reference: 'REF-99',
        },
      ],
    } satisfies MovementMatchResult);
    mockJournalAlreadyHasCaptureSource.mockResolvedValue(true);

    await expect(
      applyEvidenceDrivenObservationSettlement({
        session,
        workplaceId,
        observation,
        captureGate: gate,
        loader: { loadFacts: jest.fn() },
      }),
    ).resolves.toMatchObject({
      kind: 'linked',
      journalId: 'posted-ref-1',
      hardIdentity: true,
    });

    expect(mockDecideCapture).not.toHaveBeenCalled();
    expect(mockStageLinkedCaptureSource).not.toHaveBeenCalled();
  });
});

describe('pipeline import smoke', () => {
  it('wires SMS and Gmail writers to the shared helper and skips double hard staging', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const root = path.join(__dirname, '..', '..');
    const sms = fs.readFileSync(path.join(root, 'sms/pipeline/smsSyncPipeline.ts'), 'utf8');
    const gmail = fs.readFileSync(path.join(root, 'email/gmailIngestion.ts'), 'utf8');
    expect(sms).toContain('applyEvidenceDrivenObservationSettlement');
    expect(gmail).toContain('applyEvidenceDrivenObservationSettlement');
    expect(sms).toContain('hardIdentityAlreadyLinked');
    expect(gmail).toContain('evidence.hardIdentity');
    expect(typeof applyEvidenceDrivenObservationSettlement).toBe('function');
  });
});
