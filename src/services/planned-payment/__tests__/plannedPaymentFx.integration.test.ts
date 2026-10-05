import { database } from '@/src/data/database/Database';
import { accountWriteRepository } from '@/src/data/repositories/account';
import {
  createPlannedFxPayment,
  seedPlannedPaymentFxWorkplace,
} from '@/src/testing/plannedPaymentFixtures';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { journalService } from '@/src/services/journal/journalDomainService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { generatePlannedOccurrence } from '../plannedPaymentJournalGeneration';
import {
  postPlannedPaymentOccurrence,
  postPlannedJournalOccurrence,
  processDuePlannedPayments,
  skipPlannedPaymentOccurrence,
} from '../plannedPaymentOrchestration';
import {
  PlannedPaymentFxReviewRequiredError,
  preparePlannedPaymentFxQuote,
  readPlannedPaymentFxContext,
  resolvePlannedPaymentFxAmounts,
  type PlannedPaymentFxReview,
} from '../plannedPaymentFx';
import { normalizeToStartOfDay } from '../plannedPaymentRecurrence';
import {
  AccountType,
  JournalStatus,
  PlannedPaymentStatus,
  TransactionType,
} from '@/src/types/enums';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import type { PlannedPaymentFxMode } from '@/src/types/plannedPaymentFx';
import type PlannedPayment from '@/src/data/models/PlannedPayment';
import { AppConfig } from '@/src/constants';

const WORKPLACE = 'planned-fx-integration' as WorkplaceId;
const DAY = AppConfig.time.msPerDay;

function mockPlannedFxExchangeRates(spotRate = 0.9, historicalRate = 0.8, asOf?: number) {
  jest.spyOn(exchangeRateService, 'getRequiredRate').mockResolvedValue(spotRate);
  jest.spyOn(exchangeRateService, 'getHistoricalRate').mockResolvedValue({
    rate: historicalRate,
    requestedDate: asOf ?? Date.now(),
    effectiveDate: asOf ?? Date.now(),
    source: 'test',
  });
}

describe('planned FX posting and review integration', () => {
  let fromAccountId: AccountId;
  let toAccountId: AccountId;
  let today: number;

  beforeEach(async () => {
    ({ fromAccountId, toAccountId } = await seedPlannedPaymentFxWorkplace(WORKPLACE));
    today = normalizeToStartOfDay(Date.now());
    mockPlannedFxExchangeRates(0.9, 0.8, today);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => rebuildQueueService.stop());

  const payment = (
    mode?: PlannedPaymentFxMode,
    options: { auto?: boolean; amount?: number; destinationAmount?: number; date?: number } = {},
  ) =>
    createPlannedFxPayment(WORKPLACE, fromAccountId, toAccountId, mode, {
      ...options,
      date: options.date ?? today,
    });
  const journals = (plan: PlannedPayment, status: JournalStatus) =>
    journalPlannedQueries.findByPlannedPaymentAndStatus(WORKPLACE, plan.id, status);
  async function postedLines(plan: PlannedPayment) {
    const [journal] = await journals(plan, JournalStatus.POSTED);
    const lines = await transactionQueryRepository.findByJournal(WORKPLACE, journal.id);
    return {
      journal,
      source: lines.find(line => line.transactionType === TransactionType.CREDIT)!,
      destination: lines.find(line => line.transactionType === TransactionType.DEBIT)!,
    };
  }
  async function reviewRequest(operation: () => Promise<unknown>) {
    try {
      await operation();
    } catch (error) {
      expect(error).toBeInstanceOf(PlannedPaymentFxReviewRequiredError);
      if (error instanceof PlannedPaymentFxReviewRequiredError) return error.request;
      throw error;
    }
    throw new Error('Posting unexpectedly bypassed manual review');
  }

  it('refreshes latest automatic preview at direct posting and keeps the source fixed', async () => {
    const plan = await payment('automatic');
    const context = await readPlannedPaymentFxContext(plan, today);
    const quote = await preparePlannedPaymentFxQuote(WORKPLACE, plan.id, today, {
      kind: 'generate',
    });
    const amounts = await resolvePlannedPaymentFxAmounts(context!, { posting: false, quote });
    expect(amounts.destinationAmount).toBe(90);
    jest.mocked(exchangeRateService.getRequiredRate).mockResolvedValue(0.75);
    await postPlannedPaymentOccurrence(WORKPLACE, plan.id, today);
    const { journal, source, destination } = await postedLines(plan);
    expect(journal.currencyCode).toBe('USD');
    expect(source).toMatchObject({ amount: 100, currencyCode: 'USD', exchangeRate: 1 });
    expect(destination).toMatchObject({ amount: 75, currencyCode: 'EUR', exchangeRate: 100 / 75 });
  });

  it('posts fixed exact destination without any market lookup', async () => {
    const plan = await payment('fixed', { destinationAmount: 87.23 });
    await postPlannedPaymentOccurrence(WORKPLACE, plan.id, today);
    const { source, destination } = await postedLines(plan);
    expect(source.amount).toBe(100);
    expect(destination.amount).toBe(87.23);
    expect(destination.exchangeRate).toBe(100 / 87.23);
    expect(exchangeRateService.getRequiredRate).not.toHaveBeenCalled();
    expect(exchangeRateService.getHistoricalRate).not.toHaveBeenCalled();
  });

  it('uses latest posting-time FX for generated overdue automatic posting', async () => {
    const date = today - 2 * DAY;
    const plan = await payment('automatic', { auto: true, date });
    await generatePlannedOccurrence(WORKPLACE, plan.id, date, undefined, today);
    expect(exchangeRateService.getRequiredRate).toHaveBeenCalledWith('USD', 'EUR');
    expect(exchangeRateService.getHistoricalRate).not.toHaveBeenCalled();
    const { journal, destination } = await postedLines(plan);
    expect(journal.journalDate).toBe(date);
    expect(destination.amount).toBe(90);
  });

  it('uses current FX when manually posting an overdue occurrence now', async () => {
    const date = today - 2 * DAY;
    const plan = await payment('automatic', { date });
    await postPlannedPaymentOccurrence(WORKPLACE, plan.id, date);
    expect((await postedLines(plan)).destination.amount).toBe(90);
    expect(exchangeRateService.getHistoricalRate).not.toHaveBeenCalled();
  });

  it('posts a real parity quote without using the legacy fallback getter', async () => {
    const plan = await payment('automatic');
    jest.mocked(exchangeRateService.getRequiredRate).mockResolvedValue(1);
    const fallback = jest.spyOn(exchangeRateService, 'getRate');
    await postPlannedPaymentOccurrence(WORKPLACE, plan.id, today);
    expect((await postedLines(plan)).destination.amount).toBe(100);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('leaves direct automatic posting pending without schedule/audit/ledger partial writes', async () => {
    const plan = await payment('automatic');
    jest.mocked(exchangeRateService.getRequiredRate).mockResolvedValue(null);
    const batch = jest.spyOn(database, 'batch');
    await expect(postPlannedPaymentOccurrence(WORKPLACE, plan.id, today)).rejects.toThrow(
      /rate unavailable/,
    );
    expect(await journals(plan, JournalStatus.POSTED)).toHaveLength(0);
    expect(await journals(plan, JournalStatus.PLANNED)).toHaveLength(0);
    expect(plan.nextOccurrence).toBe(today);
    expect(batch).not.toHaveBeenCalled();
  });

  it('leaves generated-due automatic failure at the current schedule cursor', async () => {
    const plan = await payment('automatic', { auto: true });
    jest.mocked(exchangeRateService.getRequiredRate).mockResolvedValue(null);
    await processDuePlannedPayments(WORKPLACE);
    expect(plan.nextOccurrence).toBe(today);
    expect(await journals(plan, JournalStatus.POSTED)).toHaveLength(0);
    expect(await journals(plan, JournalStatus.PLANNED)).toHaveLength(0);
  });

  it('generates future placeholders offline then refreshes and posts when due', async () => {
    const date = today + DAY;
    const plan = await payment('automatic', { auto: true, date });
    jest.mocked(exchangeRateService.getRequiredRate).mockResolvedValue(null);
    await generatePlannedOccurrence(WORKPLACE, plan.id, date, undefined, today);
    const [scheduled] = await journals(plan, JournalStatus.PLANNED);
    expect(scheduled).toBeDefined();
    jest.mocked(exchangeRateService.getRequiredRate).mockResolvedValue(0.7);
    jest.spyOn(Date, 'now').mockReturnValue(date + 1000);
    await processDuePlannedPayments(WORKPLACE);
    expect((await postedLines(plan)).destination.amount).toBe(70);
    expect((await postedLines(plan)).journal.id).toBe(scheduled.id);
  });

  it('refreshes already-generated auto amounts and retains an edited source amount and accounts', async () => {
    const date = today + DAY;
    const plan = await payment('automatic', { auto: true, date });
    await generatePlannedOccurrence(WORKPLACE, plan.id, date, undefined, today);
    const [scheduled] = await journals(plan, JournalStatus.PLANNED);
    const alternate = await accountWriteRepository.create({
      name: 'Alternate EUR',
      accountType: AccountType.ASSET,
      currencyCode: 'EUR',
      workplaceId: WORKPLACE,
    });
    await journalPersistenceService.put(
      {
        journalId: scheduled.id,
        description: 'Edited occurrence',
        transactions: [
          {
            accountId: fromAccountId,
            amount: 150,
            transactionType: TransactionType.CREDIT,
            currencyCode: 'USD',
            notes: 'source edit',
          },
          {
            accountId: alternate.id,
            amount: 99,
            transactionType: TransactionType.DEBIT,
            currencyCode: 'EUR',
            exchangeRate: 150 / 99,
            notes: 'destination edit',
          },
        ],
      },
      WORKPLACE,
    );
    jest.mocked(exchangeRateService.getRequiredRate).mockResolvedValue(0.6);
    jest.spyOn(Date, 'now').mockReturnValue(date + 1000);
    await processDuePlannedPayments(WORKPLACE);
    const { journal, source, destination } = await postedLines(plan);
    expect(journal.description).toBe('Edited occurrence');
    expect(source).toMatchObject({ amount: 150, accountId: fromAccountId, notes: 'source edit' });
    expect(destination).toMatchObject({
      amount: 90,
      accountId: alternate.id,
      notes: 'destination edit',
    });
    expect(plan.amount).toBe(100);
  });

  it('leaves an already-generated auto journal and cursor unchanged on rate failure', async () => {
    const plan = await payment('automatic', { auto: true });
    // Generate ahead of an earlier asOf to leave this occurrence planned.
    await generatePlannedOccurrence(WORKPLACE, plan.id, today, undefined, today - DAY);
    const [scheduled] = await journals(plan, JournalStatus.PLANNED);
    const before = (await transactionQueryRepository.findByJournal(WORKPLACE, scheduled.id)).map(
      line => [line.amount, line.exchangeRate],
    );
    const cursor = plan.nextOccurrence;
    jest.mocked(exchangeRateService.getRequiredRate).mockResolvedValue(null);
    await processDuePlannedPayments(WORKPLACE);
    expect(scheduled.status).toBe(JournalStatus.PLANNED);
    expect(plan.nextOccurrence).toBe(cursor);
    expect(
      (await transactionQueryRepository.findByJournal(WORKPLACE, scheduled.id)).map(line => [
        line.amount,
        line.exchangeRate,
      ]),
    ).toEqual(before);
  });

  it('requires a typed review despite a manual destination suggestion, then overrides only this occurrence', async () => {
    const plan = await payment('manual', { destinationAmount: 88 });
    const request = await reviewRequest(() =>
      postPlannedPaymentOccurrence(WORKPLACE, plan.id, today),
    );
    expect(request).toMatchObject({
      workplaceId: WORKPLACE,
      plannedPaymentId: plan.id,
      name: plan.name,
      sourceAmount: 100,
      destinationAmount: 88,
      sourceCurrency: 'USD',
      destinationCurrency: 'EUR',
    });
    expect(plan.nextOccurrence).toBe(today);
    const review: PlannedPaymentFxReview = { ...request, sourceAmount: 120, destinationAmount: 85 };
    await postPlannedPaymentOccurrence(WORKPLACE, plan.id, today, review);
    const { source, destination } = await postedLines(plan);
    expect(source.amount).toBe(120);
    expect(destination.amount).toBe(85);
    expect(destination.exchangeRate).toBe(120 / 85);
    expect(plan.amount).toBe(100);
    expect(plan.destinationAmount).toBe(88);
    expect(exchangeRateService.getRequiredRate).not.toHaveBeenCalled();
  });

  it('requires review on exact scheduled-journal posting and seeds edited native amounts', async () => {
    const plan = await payment('manual', { destinationAmount: 88 });
    await generatePlannedOccurrence(WORKPLACE, plan.id, today);
    const [scheduled] = await journals(plan, JournalStatus.PLANNED);
    await journalPersistenceService.put(
      {
        journalId: scheduled.id,
        transactions: [
          {
            accountId: fromAccountId,
            amount: 33,
            transactionType: TransactionType.CREDIT,
            currencyCode: 'USD',
          },
          {
            accountId: toAccountId,
            amount: 24,
            transactionType: TransactionType.DEBIT,
            currencyCode: 'EUR',
            exchangeRate: 33 / 24,
          },
        ],
      },
      WORKPLACE,
    );
    const request = await reviewRequest(() =>
      postPlannedJournalOccurrence(WORKPLACE, plan.id, scheduled.id, today),
    );
    expect(request).toMatchObject({
      sourceAmount: 33,
      destinationAmount: 24,
      journalId: scheduled.id,
    });
    await postPlannedJournalOccurrence(WORKPLACE, plan.id, scheduled.id, today, {
      ...request,
      destinationAmount: 26,
    });
    expect((await postedLines(plan)).source.amount).toBe(33);
    expect((await postedLines(plan)).destination.amount).toBe(26);
  });

  it('rejects a stale plan review without writes', async () => {
    const plan = await payment('manual');
    const request = await reviewRequest(() =>
      postPlannedPaymentOccurrence(WORKPLACE, plan.id, today),
    );
    await database.write(() =>
      plan.update(record => {
        record.amount = 110;
      }),
    );
    await expect(
      postPlannedPaymentOccurrence(WORKPLACE, plan.id, today, {
        ...request,
        destinationAmount: 90,
      }),
    ).rejects.toThrow(/stale/);
    expect(await journals(plan, JournalStatus.POSTED)).toHaveLength(0);
    expect(plan.nextOccurrence).toBe(today);
  });

  it('rejects a stale scheduled-line review even when journal timestamps are unchanged', async () => {
    const plan = await payment('manual');
    await generatePlannedOccurrence(WORKPLACE, plan.id, today);
    const [scheduled] = await journals(plan, JournalStatus.PLANNED);
    const request = await reviewRequest(() =>
      postPlannedJournalOccurrence(WORKPLACE, plan.id, scheduled.id, today),
    );
    const [line] = await transactionQueryRepository.findByJournal(WORKPLACE, scheduled.id);
    await database.write(() =>
      line.update(record => {
        record.amount += 1;
      }),
    );
    await expect(
      postPlannedJournalOccurrence(WORKPLACE, plan.id, scheduled.id, today, {
        ...request,
        destinationAmount: 95,
      }),
    ).rejects.toThrow(/stale/);
    expect(scheduled.status).toBe(JournalStatus.PLANNED);
  });

  it('never auto-posts manual mode on either generation or already-generated routes', async () => {
    const plan = await payment('manual', { auto: true, destinationAmount: 88 });
    await processDuePlannedPayments(WORKPLACE);
    expect(await journals(plan, JournalStatus.PLANNED)).toHaveLength(1);
    await processDuePlannedPayments(WORKPLACE);
    expect(await journals(plan, JournalStatus.PLANNED)).toHaveLength(1);
    expect(await journals(plan, JournalStatus.POSTED)).toHaveLength(0);
  });

  it('protects the ordinary JournalService post button from bypassing manual review', async () => {
    const plan = await payment('manual');
    await generatePlannedOccurrence(WORKPLACE, plan.id, today);
    const [scheduled] = await journals(plan, JournalStatus.PLANNED);
    const request = await reviewRequest(() => journalService.postJournal(scheduled.id, WORKPLACE));
    expect(scheduled.status).toBe(JournalStatus.PLANNED);
    await journalService.postJournal(scheduled.id, WORKPLACE, undefined, undefined, undefined, {
      ...request,
      sourceAmount: 125,
      destinationAmount: 91,
    });
    expect((await postedLines(plan)).source.amount).toBe(125);
    expect((await postedLines(plan)).destination.amount).toBe(91);
  });

  it('ordinary journal posting uses latest FX even with a past effective posting date', async () => {
    const plan = await payment('automatic');
    await generatePlannedOccurrence(WORKPLACE, plan.id, today);
    const [scheduled] = await journals(plan, JournalStatus.PLANNED);
    const postedAt = today - DAY;
    await journalService.postJournal(scheduled.id, WORKPLACE, postedAt);
    expect((await postedLines(plan)).destination.amount).toBe(90);
    expect(exchangeRateService.getHistoricalRate).not.toHaveBeenCalled();
  });

  it('preserves fixed occurrence amount/account/notes edits instead of reapplying the template', async () => {
    const plan = await payment('fixed', { destinationAmount: 88 });
    await generatePlannedOccurrence(WORKPLACE, plan.id, today);
    const [scheduled] = await journals(plan, JournalStatus.PLANNED);
    const alternate = await accountWriteRepository.create({
      name: 'Alternate EUR',
      accountType: AccountType.ASSET,
      currencyCode: 'EUR',
      workplaceId: WORKPLACE,
    });
    await journalPersistenceService.put(
      {
        journalId: scheduled.id,
        description: 'Keep description',
        notes: 'Keep note',
        transactions: [
          {
            accountId: fromAccountId,
            amount: 77,
            transactionType: TransactionType.CREDIT,
            notes: 'credit note',
          },
          {
            accountId: alternate.id,
            amount: 63,
            transactionType: TransactionType.DEBIT,
            exchangeRate: 77 / 63,
            notes: 'debit note',
          },
        ],
      },
      WORKPLACE,
    );
    await postPlannedJournalOccurrence(WORKPLACE, plan.id, scheduled.id, today);
    const { journal, source, destination } = await postedLines(plan);
    expect(journal).toMatchObject({ description: 'Keep description', notes: 'Keep note' });
    expect(source.amount).toBe(77);
    expect(destination).toMatchObject({
      accountId: alternate.id,
      amount: 63,
      notes: 'debit note',
      exchangeRate: 77 / 63,
    });
  });

  it('rounds converted JPY at native precision and uses the rounded implied rate to balance', async () => {
    toAccountId = (
      await accountWriteRepository.create({
        name: 'JPY destination',
        accountType: AccountType.ASSET,
        currencyCode: 'JPY',
        workplaceId: WORKPLACE,
      })
    ).id;
    const plan = await payment('automatic', { amount: 12.34 });
    jest.mocked(exchangeRateService.getRequiredRate).mockResolvedValue(150.123);
    await postPlannedPaymentOccurrence(WORKPLACE, plan.id, today);
    const { source, destination, journal } = await postedLines(plan);
    expect(source.amount).toBe(12.34);
    expect(destination.amount).toBe(1853);
    expect(destination.exchangeRate).toBe(12.34 / 1853);
    expect(journal.totalAmount).toBe(12.34);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid reviewed destination %s atomically',
    async amount => {
      const plan = await payment('manual');
      const request = await reviewRequest(() =>
        postPlannedPaymentOccurrence(WORKPLACE, plan.id, today),
      );
      await expect(
        postPlannedPaymentOccurrence(WORKPLACE, plan.id, today, {
          ...request,
          destinationAmount: amount,
        }),
      ).rejects.toThrow(/amounts must be positive/);
      expect(await journals(plan, JournalStatus.POSTED)).toHaveLength(0);
      expect(plan.nextOccurrence).toBe(today);
    },
  );

  it('manual same-currency posting needs no review and uses equal native amounts', async () => {
    toAccountId = (
      await accountWriteRepository.create({
        name: 'USD destination',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId: WORKPLACE,
      })
    ).id;
    const plan = await payment('manual');
    await postPlannedPaymentOccurrence(WORKPLACE, plan.id, today);
    const { source, destination } = await postedLines(plan);
    expect(source.amount).toBe(destination.amount);
    expect(exchangeRateService.getRequiredRate).not.toHaveBeenCalled();
  });

  it('skips a manual occurrence without requesting review or market data', async () => {
    const plan = await payment('manual');
    // Existing planned explicit journal has valid native currencies/rates.
    await generatePlannedOccurrence(WORKPLACE, plan.id, today);
    jest.mocked(exchangeRateService.getRequiredRate).mockClear();
    await skipPlannedPaymentOccurrence(WORKPLACE, plan.id, today);
    expect(await journals(plan, JournalStatus.SKIPPED)).toHaveLength(1);
    expect(exchangeRateService.getRequiredRate).not.toHaveBeenCalled();
  });
  it.each(['fixed', 'manual'] as const)(
    'rejects excess %s destination precision without writing',
    async mode => {
      const plan = await payment(mode, { destinationAmount: 87.231 });
      const batch = jest.spyOn(database, 'batch');
      let review: PlannedPaymentFxReview | undefined;
      if (mode === 'manual') {
        const request = await reviewRequest(() =>
          postPlannedPaymentOccurrence(WORKPLACE, plan.id, today),
        );
        review = { ...request, destinationAmount: 87.231 };
      }
      await expect(postPlannedPaymentOccurrence(WORKPLACE, plan.id, today, review)).rejects.toThrow(
        /Destination amount exceeds currency precision/,
      );
      expect(batch).not.toHaveBeenCalled();
      expect(plan.nextOccurrence).toBe(today);
    },
  );

  it('rejects excess reviewed source precision without rounding away the entered amount', async () => {
    const plan = await payment('manual');
    const request = await reviewRequest(() =>
      postPlannedPaymentOccurrence(WORKPLACE, plan.id, today),
    );
    await expect(
      postPlannedPaymentOccurrence(WORKPLACE, plan.id, today, {
        ...request,
        sourceAmount: 12.345,
        destinationAmount: 10,
      }),
    ).rejects.toThrow(/Source amount exceeds currency precision/);
    expect(await journals(plan, JournalStatus.POSTED)).toHaveLength(0);
    expect(plan.nextOccurrence).toBe(today);
  });

  it('retains an exact fixed amount in a three-decimal native currency', async () => {
    toAccountId = (
      await accountWriteRepository.create({
        name: 'KWD destination',
        accountType: AccountType.ASSET,
        currencyCode: 'KWD',
        workplaceId: WORKPLACE,
      })
    ).id;
    const plan = await payment('fixed', { destinationAmount: 30.123 });
    await postPlannedPaymentOccurrence(WORKPLACE, plan.id, today);
    expect((await postedLines(plan)).destination.amount).toBe(30.123);
    expect((await postedLines(plan)).destination.exchangeRate).toBe(100 / 30.123);
  });

  it('retains legacy edited amounts/accounts and performs no FX resolution', async () => {
    toAccountId = (
      await accountWriteRepository.create({
        name: 'Legacy USD destination',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId: WORKPLACE,
      })
    ).id;
    const plan = await payment();
    await generatePlannedOccurrence(WORKPLACE, plan.id, today);
    const [scheduled] = await journals(plan, JournalStatus.PLANNED);
    await journalPersistenceService.put(
      {
        journalId: scheduled.id,
        transactions: [
          { accountId: fromAccountId, amount: 111, transactionType: TransactionType.CREDIT },
          { accountId: toAccountId, amount: 111, transactionType: TransactionType.DEBIT },
        ],
      },
      WORKPLACE,
    );
    await postPlannedJournalOccurrence(WORKPLACE, plan.id, scheduled.id, today);
    expect((await postedLines(plan)).source.amount).toBe(111);
    expect((await postedLines(plan)).destination.amount).toBe(111);
    expect(exchangeRateService.getRequiredRate).not.toHaveBeenCalled();
    expect(exchangeRateService.getHistoricalRate).not.toHaveBeenCalled();
  });

  it('does not advance the cursor past an existing due journal when automatic FX is unavailable', async () => {
    const plan = await payment('automatic', { auto: true });
    const scheduled = await journalPersistenceService.put(
      {
        journalDate: today,
        currencyCode: 'USD',
        status: JournalStatus.PLANNED,
        plannedPaymentId: plan.id,
        transactions: [
          {
            accountId: fromAccountId,
            amount: 100,
            transactionType: TransactionType.CREDIT,
            currencyCode: 'USD',
          },
          {
            accountId: toAccountId,
            amount: 90,
            transactionType: TransactionType.DEBIT,
            currencyCode: 'EUR',
            exchangeRate: 100 / 90,
          },
        ],
      },
      WORKPLACE,
    );
    await journalPersistenceService.put(
      {
        journalId: scheduled.id,
        metadata: {
          importSource: 'planned_payment',
          metadataJson: JSON.stringify({ plannedPaymentFx: { mode: 'automatic' } }),
        },
      },
      WORKPLACE,
    );
    jest.mocked(exchangeRateService.getRequiredRate).mockResolvedValue(null);
    await processDuePlannedPayments(WORKPLACE);
    expect(scheduled.status).toBe(JournalStatus.PLANNED);
    expect(plan.nextOccurrence).toBe(today);
    expect(plan.status).toBe(PlannedPaymentStatus.ACTIVE);
  });

  it('skips a not-yet-generated manual FX occurrence without market data or review', async () => {
    const plan = await payment('manual');
    await skipPlannedPaymentOccurrence(WORKPLACE, plan.id, today);
    expect(await journals(plan, JournalStatus.SKIPPED)).toHaveLength(1);
    expect(exchangeRateService.getRequiredRate).not.toHaveBeenCalled();
  });
  it('retries virtual pending automatic generation after a missing quote becomes available', async () => {
    const plan = await payment('automatic', { auto: true });
    jest.mocked(exchangeRateService.getRequiredRate).mockResolvedValue(null);
    await processDuePlannedPayments(WORKPLACE);
    expect(plan.nextOccurrence).toBe(today);
    expect(await journals(plan, JournalStatus.PLANNED)).toHaveLength(0);
    expect(await journals(plan, JournalStatus.POSTED)).toHaveLength(0);
    jest.mocked(exchangeRateService.getRequiredRate).mockResolvedValue(0.7);
    await processDuePlannedPayments(WORKPLACE);
    expect((await postedLines(plan)).destination.amount).toBe(70);
    expect(plan.nextOccurrence).toBeGreaterThan(today);
    expect(plan.status).toBe(PlannedPaymentStatus.COMPLETED);
  });

  it('uses latest FX when already-generated overdue automatic journals post', async () => {
    const date = today - 2 * DAY;
    const plan = await payment('automatic', { auto: true, date });
    await generatePlannedOccurrence(WORKPLACE, plan.id, date, undefined, date - DAY);
    expect(await journals(plan, JournalStatus.PLANNED)).toHaveLength(1);
    jest.mocked(exchangeRateService.getRequiredRate).mockResolvedValue(0.65);
    await processDuePlannedPayments(WORKPLACE);
    expect((await postedLines(plan)).destination.amount).toBe(65);
    expect((await postedLines(plan)).journal.journalDate).toBe(date);
    expect(exchangeRateService.getHistoricalRate).not.toHaveBeenCalled();
  });

  it('preserves a legacy pending journal after the recurring template switches to manual FX', async () => {
    toAccountId = (
      await accountWriteRepository.create({
        name: 'Legacy USD',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId: WORKPLACE,
      })
    ).id;
    const plan = await payment();
    await generatePlannedOccurrence(WORKPLACE, plan.id, today);
    const [scheduled] = await journals(plan, JournalStatus.PLANNED);
    await journalPersistenceService.put(
      {
        journalId: scheduled.id,
        description: 'Legacy edited journal',
        transactions: [
          { accountId: fromAccountId, amount: 111, transactionType: TransactionType.CREDIT },
          { accountId: toAccountId, amount: 111, transactionType: TransactionType.DEBIT },
        ],
      },
      WORKPLACE,
    );
    await database.write(() =>
      plan.update(record => {
        record.fxMode = 'manual';
        record.amount = 222;
        record.destinationAmount = 200;
      }),
    );
    await postPlannedJournalOccurrence(WORKPLACE, plan.id, scheduled.id, today);
    const { journal, source, destination } = await postedLines(plan);
    expect(journal.description).toBe('Legacy edited journal');
    expect(source.amount).toBe(111);
    expect(destination.amount).toBe(111);
    expect(exchangeRateService.getRequiredRate).not.toHaveBeenCalled();
  });
});
