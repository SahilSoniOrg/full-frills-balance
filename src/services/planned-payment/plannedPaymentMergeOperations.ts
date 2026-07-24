import PlannedPayment from '@/src/data/models/PlannedPayment';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { AccountId, WorkplaceId } from '@/src/types/domain';

/**
 * Prepares WatermelonDB operations to merge planned payments from source accounts to a target account.
 */
export async function preparePlannedPaymentMergeOperations(
  workplaceId: WorkplaceId,
  sourceAccountIds: AccountId[],
  targetAccountId: AccountId,
): Promise<PlannedPayment[]> {
  const plannedFrom = await plannedPaymentRepository.findAllByFromAccountIds(
    workplaceId,
    sourceAccountIds,
  );
  const plannedTo = await plannedPaymentRepository.findAllByToAccountIds(
    workplaceId,
    sourceAccountIds,
  );

  const mutations = new Map<
    string,
    { from?: AccountId; to?: AccountId; record: PlannedPayment }
  >();

  plannedFrom.forEach(p => {
    if (!mutations.has(p.id)) {
      mutations.set(p.id, { record: p });
    }
    mutations.get(p.id)!.from = targetAccountId;
  });

  plannedTo.forEach(p => {
    if (!mutations.has(p.id)) {
      mutations.set(p.id, { record: p });
    }
    mutations.get(p.id)!.to = targetAccountId;
  });

  return Array.from(mutations.values()).map(({ record, from, to }) => {
    return record.prepareUpdate((r: PlannedPayment) => {
      if (from) r.fromAccountId = from;
      if (to) r.toAccountId = to;
      r.updatedAt = new Date();
    });
  });
}
