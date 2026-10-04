import { database } from '@/src/data/database/Database';
import { toPlainPlannedPayment } from '@/src/data/models/PlannedPayment';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { registerAuditHandlers } from '@/src/services/audit-handlers';
import { auditService } from '@/src/services/audit-service';
import { AccountType, PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';

const WP = 'wp-fx-audit' as WorkplaceId;
registerAuditHandlers();

beforeEach(async () => {
  await database.write(() => database.unsafeResetDatabase());
});

async function createPayment() {
  const from = await accountWriteRepository.create({
    name: 'From',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId: WP,
  });
  const to = await accountWriteRepository.create({
    name: 'To',
    accountType: AccountType.ASSET,
    currencyCode: 'EUR',
    workplaceId: WP,
  });
  return plannedPaymentRepository.create(WP, {
    name: 'Transfer',
    amount: 100,
    currencyCode: 'INR',
    fromAccountId: from.id,
    toAccountId: to.id,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: 1000,
    nextOccurrence: 1000,
    status: PlannedPaymentStatus.ACTIVE,
    isAutoPost: false,
  });
}

it('records new FX fields and undo restores absent mode without rewriting legacy currency', async () => {
  const payment = await createPayment();
  await plannedPaymentRepository.updateSchedule(WP, payment, {
    fxMode: 'fixed',
    destinationAmount: 90,
  });
  const log = (await auditRepository.findByEntity('planned_payment', payment.id, WP)).find(
    entry => entry.eventType === 'planned_payment.updated',
  )!;
  expect(log.parsedChanges?.before).toMatchObject({ fxMode: null, destinationAmount: null });
  expect(log.parsedChanges?.after).toMatchObject({ fxMode: 'fixed', destinationAmount: 90 });
  expect(await auditService.revertEntry(log.id, WP)).toEqual({ success: true });
  expect(payment.fxMode).toBeNull();
  expect(payment.destinationAmount).toBeNull();
  expect(payment.currencyCode).toBe('INR');
});

it('undo restores a manual destination suggestion after automatic mode clears it', async () => {
  const payment = await createPayment();
  await plannedPaymentRepository.updateSchedule(WP, payment, {
    fxMode: 'manual',
    destinationAmount: 90,
  });
  await plannedPaymentRepository.updateSchedule(WP, payment, {
    fxMode: 'automatic',
    destinationAmount: undefined,
  });
  const log = (await auditRepository.findByEntity('planned_payment', payment.id, WP)).find(
    entry => entry.parsedChanges?.after?.fxMode === 'automatic',
  )!;
  expect(log.parsedChanges?.after).toMatchObject({ fxMode: 'automatic', destinationAmount: null });
  expect(await auditService.revertEntry(log.id, WP)).toEqual({ success: true });
  expect(payment.fxMode).toBe('manual');
  expect(payment.destinationAmount).toBe(90);
});

it('rejects stale FX undo after a subsequent destination amount edit', async () => {
  const payment = await createPayment();
  await plannedPaymentRepository.updateSchedule(WP, payment, {
    fxMode: 'fixed',
    destinationAmount: 90,
  });
  const log = (await auditRepository.findByEntity('planned_payment', payment.id, WP)).find(
    entry => entry.eventType === 'planned_payment.updated',
  )!;
  await plannedPaymentRepository.updateSchedule(WP, payment, { destinationAmount: 95 });
  expect((await auditService.revertEntry(log.id, WP)).success).toBe(false);
  expect(payment.fxMode).toBe('fixed');
  expect(payment.destinationAmount).toBe(95);
});

it('keeps different FX policies distinct when merging account references', async () => {
  const payment = await createPayment();
  await plannedPaymentRepository.updateSchedule(WP, payment, { fxMode: 'automatic' });
  const target = await accountWriteRepository.create({
    name: 'Merge target',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId: WP,
  });
  const snapshot = toPlainPlannedPayment(payment);
  const duplicate = await plannedPaymentRepository.create(WP, {
    name: snapshot.name,
    amount: snapshot.amount,
    currencyCode: snapshot.currencyCode,
    fromAccountId: target.id,
    toAccountId: snapshot.toAccountId,
    intervalN: snapshot.intervalN,
    intervalType: snapshot.intervalType,
    startDate: snapshot.startDate,
    nextOccurrence: snapshot.nextOccurrence,
    status: snapshot.status,
    isAutoPost: snapshot.isAutoPost,
    fxMode: 'fixed',
    destinationAmount: 90,
  });
  await runAccountingWriteSession(session =>
    plannedPaymentRepository.mergeAccountsInSession(
      session,
      WP,
      [payment.fromAccountId],
      target.id,
    ),
  );
  expect(payment.fromAccountId).toBe(target.id);
  expect(payment.status).toBe(PlannedPaymentStatus.ACTIVE);
  expect(duplicate.status).toBe(PlannedPaymentStatus.ACTIVE);
  expect(payment.fxMode).toBe('automatic');
  expect(duplicate.destinationAmount).toBe(90);
});
