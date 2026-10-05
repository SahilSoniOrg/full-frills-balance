import { database } from '@/src/data/database/Database';
import PlannedPayment, { toPlainPlannedPayment } from '@/src/data/models/PlannedPayment';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import { fetchAndTransformTable } from '@/src/services/export/exportTableTransformer';
import { nativePlugin } from '@/src/services/import/plugins/native-plugin';
import { resolveParsedImportBatchData } from '@/src/services/import/canonicalImportAdapter';
import { validateImportedData } from '@/src/services/import/validateImportedData';
import { AccountType, PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import type { PlannedPaymentFxMode } from '@/src/types/plainDtos';
import { resetDatabase } from '@/src/testing/resetDatabase';

const WP = 'wp-fx-backup' as WorkplaceId;
const RESTORED_WP = 'wp-fx-restored' as WorkplaceId;

beforeEach(async () => {
  await resetDatabase();
});

it.each([undefined, 'automatic', 'fixed', 'manual'] as const)(
  'round-trips planned payment %s through schema export, native parsing, and import persistence',
  async (fxMode: PlannedPaymentFxMode | undefined) => {
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
    const payment = await plannedPaymentRepository.create(WP, {
      name: 'Transfer',
      amount: 100,
      currencyCode: fxMode ? 'USD' : 'INR',
      fxMode,
      destinationAmount: fxMode === 'fixed' || fxMode === 'manual' ? 90 : undefined,
      fromAccountId: from.id,
      toAccountId: to.id,
      intervalN: 1,
      intervalType: PlannedPaymentInterval.MONTHLY,
      startDate: Date.UTC(2026, 0, 1),
      nextOccurrence: Date.UTC(2026, 1, 1),
      status: PlannedPaymentStatus.ACTIVE,
      isAutoPost: fxMode !== 'manual',
    });
    const exported = await fetchAndTransformTable(WP, 'planned_payments');
    expect(exported).toEqual([
      expect.objectContaining({
        fxMode: fxMode ?? null,
        destinationAmount: fxMode === 'fixed' || fxMode === 'manual' ? 90 : null,
      }),
    ]);
    const parsed = await nativePlugin.parse(
      {
        uri: 'memory://fx-backup.json',
        name: 'fx-backup.json',
        rawBytes: new Uint8Array(),
        json: {
          version: '1.4.0',
          accounts: await fetchAndTransformTable(WP, 'accounts'),
          plannedPayments: exported,
          journals: [],
          transactions: [],
        },
      },
      { defaultCurrency: 'USD' },
    );
    const data = resolveParsedImportBatchData(parsed);
    validateImportedData(data);
    const imported = data.plannedPayments![0];
    expect(imported.fromAccountId).not.toBe(from.id);
    expect(imported.toAccountId).not.toBe(to.id);
    await importRepository.batchInsert(RESTORED_WP, data);
    const restored = await database.collections
      .get<PlannedPayment>('planned_payments')
      .find(imported.id);
    const {
      id: originalId,
      fromAccountId: originalFrom,
      toAccountId: originalTo,
      ...original
    } = toPlainPlannedPayment(payment);
    const {
      id: restoredId,
      fromAccountId: restoredFrom,
      toAccountId: restoredTo,
      ...roundTripped
    } = toPlainPlannedPayment(restored);
    expect(roundTripped).toEqual(original);
    expect(restored.workplaceId).toBe(RESTORED_WP);
    expect(restoredId).not.toBe(originalId);
    expect(restoredFrom).not.toBe(originalFrom);
    expect(restoredTo).not.toBe(originalTo);
  },
);
