import {
  AccountType,
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/types/enums';
import type { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import type { MovementObservation } from '@/src/domain/planned-payment/sharedMovementMatcher';
import {
  createRepositorySharedMovementMatchLoader,
  findSharedMovementMatch,
  type SharedMovementMatchLoaderDeps,
} from '../sharedMovementMatcher';

const workplaceId = 'wp1' as WorkplaceId;
/** Local midnight, matching `normalizeToStartOfDay`. */
const day = (month: number, date: number) => new Date(2026, month - 1, date).getTime();
const obs: MovementObservation = {
  id: 'sms1',
  channel: 'sms',
  amount: 100,
  currency: 'USD',
  accountId: 'cash',
  direction: 'debit',
  date: day(1, 10),
};

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan1' as PlannedPaymentId,
    name: 'Rent',
    amount: 100,
    currencyCode: 'USD',
    fromAccountId: 'cash' as AccountId,
    toAccountId: 'rent' as AccountId,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: day(1, 1),
    nextOccurrence: day(1, 10),
    status: PlannedPaymentStatus.ACTIVE,
    isAutoPost: false,
    ...overrides,
  };
}

function account(id: string, accountType: AccountType) {
  return { id, accountType } as { id: AccountId; accountType: AccountType };
}

function journal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'j1' as JournalId,
    journalDate: day(1, 10),
    totalAmount: 100,
    currencyCode: 'USD',
    status: JournalStatus.PLANNED,
    plannedPaymentId: 'plan1' as PlannedPaymentId,
    ...overrides,
  };
}

function deps(
  overrides: Partial<SharedMovementMatchLoaderDeps> = {},
): SharedMovementMatchLoaderDeps {
  return {
    findAllActive: async () => [payment() as never],
    findAccountsByIds: async () =>
      [account('cash', AccountType.ASSET), account('rent', AccountType.EXPENSE)] as never,
    findLinkedForMatcher: async () => [],
    findUnlinkedPostedNear: async () => [],
    findTransactionsByJournals: async () => [],
    findPendingSms: async () => [],
    findPendingEmail: async () => [],
    findReferenceMatches: async () => [],
    findReferenceCandidates: async () => [],
    loadJournalMetadata: async () => [],
    findInboxLinkedToJournals: async () => [],
    now: () => day(1, 10),
    ...overrides,
  };
}

describe('createRepositorySharedMovementMatchLoader', () => {
  it('projects an ungenerated due occurrence and returns a strict unique match', async () => {
    const loader = createRepositorySharedMovementMatchLoader(workplaceId, deps());
    const result = await findSharedMovementMatch(obs, loader);
    expect(result.kind).toBe('strictUnique');
    if (result.kind === 'strictUnique') {
      expect(result.occurrence.id).toBe(`plan:plan1:${day(1, 10)}`);
      expect(result.silentAttach).toBe(false);
    }
  });

  it('uses a PLANNED journal occurrence and its edited amount', async () => {
    const loader = createRepositorySharedMovementMatchLoader(
      workplaceId,
      deps({
        findLinkedForMatcher: async () => [journal({ totalAmount: 110 }) as never],
      }),
    );
    const result = await findSharedMovementMatch({ ...obs, amount: 110 }, loader);
    expect(result.kind).toBe('strictUnique');
    if (result.kind === 'strictUnique') {
      expect(result.occurrence.id).toBe('j1');
      expect(result.occurrence.visibleAmount).toBe(110);
    }
  });

  it('treats a pending second observation as two-sided ambiguous', async () => {
    const loader = createRepositorySharedMovementMatchLoader(
      workplaceId,
      deps({
        findLinkedForMatcher: async () => [journal() as never],
        findPendingSms: async () =>
          [
            {
              id: 'sms2',
              workplaceId,
              channel: 'sms',
              deviceSourceId: 'd2',
              inputDate: day(1, 10),
              inputFingerprint: 'fp',
              parseStatus: 'parsed',
              parsedAmount: 100,
              parsedCurrencyCode: 'USD',
              direction: 'debit',
              processingStatus: 'pending',
              suggestedSourceAccountId: 'cash',
              firstSeenAt: day(1, 10),
              lastScannedAt: day(1, 10),
            },
          ] as never,
      }),
    );
    expect((await findSharedMovementMatch(obs, loader)).kind).toBe('ambiguous');
  });

  it('routes FX plans to soft review via loaded fxMode', async () => {
    const loader = createRepositorySharedMovementMatchLoader(
      workplaceId,
      deps({
        findAllActive: async () => [payment({ fxMode: 'manual' }) as never],
        findLinkedForMatcher: async () => [journal() as never],
      }),
    );
    expect((await findSharedMovementMatch(obs, loader)).kind).toBe('soft');
  });

  it('marks SKIPPED occurrence journals so the matcher excludes them', async () => {
    const loader = createRepositorySharedMovementMatchLoader(
      workplaceId,
      deps({
        findLinkedForMatcher: async () => [
          journal({ id: 'skip1', status: JournalStatus.SKIPPED }) as never,
        ],
      }),
    );
    const facts = await loader.loadFacts(obs);
    expect(facts.occurrences).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'skip1', skipped: true })]),
    );
    expect((await findSharedMovementMatch(obs, loader)).kind).toBe('none');
  });

  it('loads unlinked capture journals for uniqueness and blocks when one matches', async () => {
    const loader = createRepositorySharedMovementMatchLoader(
      workplaceId,
      deps({
        findLinkedForMatcher: async () => [journal() as never],
        findUnlinkedPostedNear: async () =>
          [
            journal({
              id: 'cap1',
              status: JournalStatus.POSTED,
              plannedPaymentId: undefined,
            }),
          ] as never,
        findTransactionsByJournals: async () =>
          [
            {
              journalId: 'cap1',
              accountId: 'cash',
              transactionType: 'CREDIT',
              amount: 100,
              currencyCode: 'USD',
            },
          ] as never,
        loadJournalMetadata: async () =>
          [
            {
              journalId: 'cap1',
              metadataJson: JSON.stringify({
                transactionCapture: {
                  version: 1,
                  economicKind: 'expense',
                  reviewState: 'confirmed',
                  allocations: [],
                  sources: [{ channel: 'sms', sourceId: 's1', occurredAt: day(1, 10) }],
                },
              }),
            },
          ] as never,
      }),
    );
    expect((await findSharedMovementMatch(obs, loader)).kind).toBe('ambiguous');
  });

  it('routes same-channel claiming POSTED plan journals to reviewSameChannel', async () => {
    const loader = createRepositorySharedMovementMatchLoader(
      workplaceId,
      deps({
        findLinkedForMatcher: async () => [
          journal({ id: 'posted1', status: JournalStatus.POSTED }) as never,
        ],
        findInboxLinkedToJournals: async () => [
          { journalId: 'posted1' as JournalId, channel: 'sms', reference: null },
        ],
      }),
    );
    const result = await findSharedMovementMatch(obs, loader);
    expect(result.kind).toBe('reviewSameChannel');
    if (result.kind === 'reviewSameChannel') {
      expect(result.candidates).toEqual([expect.objectContaining({ id: 'posted1' })]);
    }
  });

  it('claims by occurrence day when posted journalDate differs from planned day', async () => {
    const loader = createRepositorySharedMovementMatchLoader(
      workplaceId,
      deps({
        findLinkedForMatcher: async () =>
          [
            journal({
              id: 'posted1',
              status: JournalStatus.POSTED,
              journalDate: day(1, 12),
            }),
          ] as never,
        loadJournalMetadata: async () =>
          [
            {
              journalId: 'posted1',
              metadataJson: JSON.stringify({ originalPlannedDate: day(1, 10) }),
            },
          ] as never,
        findInboxLinkedToJournals: async () => [
          { journalId: 'posted1' as JournalId, channel: 'email', reference: null },
        ],
      }),
    );
    const loaded = await loader.loadFacts(obs);
    expect(loaded.journals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'posted1',
          date: day(1, 12),
          originalPlannedDate: day(1, 10),
          planLinked: true,
          status: 'posted',
        }),
      ]),
    );
    const result = await findSharedMovementMatch(obs, loader);
    expect(result.kind).toBe('strictUnique');
    if (result.kind === 'strictUnique') {
      expect(result.occurrence.id).toBe('posted1');
      expect(result.silentAttach).toBe(true);
    }
  });

  it('routes same-channel claiming POSTED to review when journalDate differs from occurrence day', async () => {
    const loader = createRepositorySharedMovementMatchLoader(
      workplaceId,
      deps({
        findLinkedForMatcher: async () =>
          [
            journal({
              id: 'posted1',
              status: JournalStatus.POSTED,
              journalDate: day(1, 11),
            }),
          ] as never,
        loadJournalMetadata: async () =>
          [
            {
              journalId: 'posted1',
              metadataJson: JSON.stringify({ originalPlannedDate: day(1, 10) }),
            },
          ] as never,
        findInboxLinkedToJournals: async () => [
          { journalId: 'posted1' as JournalId, channel: 'sms', reference: null },
        ],
      }),
    );
    const result = await findSharedMovementMatch({ ...obs, date: day(1, 11) }, loader);
    expect(result.kind).toBe('reviewSameChannel');
  });

  it('projects dues through the soft horizon for early matching', async () => {
    const loader = createRepositorySharedMovementMatchLoader(
      workplaceId,
      deps({
        now: () => day(1, 6),
        findAllActive: async () => [
          payment({ nextOccurrence: day(1, 10), startDate: day(1, 10) }) as never,
        ],
      }),
    );
    const facts = await loader.loadFacts(obs);
    expect(facts.occurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: `plan:plan1:${day(1, 10)}`, date: day(1, 10) }),
      ]),
    );
    expect((await findSharedMovementMatch(obs, loader)).kind).toBe('strictUnique');
  });

  it('exposes transfer dual legs so to-account observations match', async () => {
    const loader = createRepositorySharedMovementMatchLoader(
      workplaceId,
      deps({
        findAllActive: async () => [
          payment({
            fromAccountId: 'bank' as AccountId,
            toAccountId: 'other-bank' as AccountId,
          }) as never,
        ],
        findAccountsByIds: async () =>
          [account('bank', AccountType.ASSET), account('other-bank', AccountType.ASSET)] as never,
      }),
    );
    const transferObs: MovementObservation = {
      ...obs,
      accountId: 'other-bank',
      direction: 'credit',
    };
    const facts = await loader.loadFacts(transferObs);
    expect(facts.occurrences[0]).toMatchObject({
      accountId: 'bank',
      toAccountId: 'other-bank',
      direction: 'credit',
    });
    expect((await findSharedMovementMatch(transferObs, loader)).kind).toBe('strictUnique');
  });
});
