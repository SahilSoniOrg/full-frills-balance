import { database } from '@/src/data/database/Database';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalPlannedQueries } from '@/src/data/repositories/journal/journalPlannedModule';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { generatePlannedJournalForPayment } from '@/src/services/planned-payment/plannedPaymentJournalGeneration';
import { processDuePlannedPayments } from '@/src/services/planned-payment/plannedPaymentOrchestration';
import {
  calculateNextOccurrence,
  normalizeToStartOfDay,
} from '@/src/services/planned-payment/plannedPaymentRecurrence';
import {
  AccountType,
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

const WORKPLACE_ID = 'wp-planned-atomic' as WorkplaceId;

describe('planned payment orchestration persistence', () => {
  let fromAccountId: AccountId;
  let toAccountId: AccountId;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });

    const from = await accountWriteRepository.create({
      name: 'Checking',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_ID,
    });
    const to = await accountWriteRepository.create({
      name: 'Rent',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId: WORKPLACE_ID,
    });

    fromAccountId = from.id;
    toAccountId = to.id;
  }, 30000);

  afterAll(() => {
    rebuildQueueService.stop();
  });

  async function createDuePayment(): Promise<PlannedPayment> {
    const occurrence = normalizeToStartOfDay(Date.now());
    return plannedPaymentRepository.create(WORKPLACE_ID, {
      name: 'Rent',
      amount: 1200,
      currencyCode: 'USD',
      fromAccountId,
      toAccountId,
      intervalN: 1,
      intervalType: PlannedPaymentInterval.DAILY,
      startDate: occurrence,
      endDate: occurrence,
      nextOccurrence: occurrence,
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: false,
    });
  }

  it('creates the journal and advances nextOccurrence in one writer batch', async () => {
    const payment = await createDuePayment();
    const expectedNextOccurrence = calculateNextOccurrence(payment.nextOccurrence, payment);

    await processDuePlannedPayments(WORKPLACE_ID);

    const journals = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);

    expect(journals).toHaveLength(1);
    expect(journals[0].status).toBe(JournalStatus.PLANNED);
    expect(reloaded?.nextOccurrence).toBe(expectedNextOccurrence);
  }, 30000);

  it('does not leave a journal or schedule advance when the batch fails', async () => {
    const payment = await createDuePayment();
    await expect(
      generatePlannedJournalForPayment(payment, payment.nextOccurrence, {
        extraOps: () => {
          throw new Error('simulated failure between journal and schedule writes');
        },
      }),
    ).resolves.toBe(false);

    const journals = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);

    expect(journals).toHaveLength(0);
    expect(reloaded?.nextOccurrence).toBe(payment.nextOccurrence);
  }, 30000);

  it('does not commit when cancellation arrives at the writer commit boundary', async () => {
    const payment = await createDuePayment();
    const controller = new AbortController();

    const generated = await generatePlannedJournalForPayment(payment, payment.nextOccurrence, {
      signal: controller.signal,
      extraOps: () => {
        controller.abort();
        return [];
      },
    });

    const journals = await journalPlannedQueries.findByPlannedPaymentIds(WORKPLACE_ID, [
      payment.id,
    ]);
    const reloaded = await plannedPaymentRepository.find(WORKPLACE_ID, payment.id);

    expect(generated).toBe(false);
    expect(journals).toHaveLength(0);
    expect(reloaded?.nextOccurrence).toBe(payment.nextOccurrence);
  }, 30000);
});
