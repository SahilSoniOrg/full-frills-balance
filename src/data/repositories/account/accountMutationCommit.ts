import {
  runAccountingWriteSession,
  stageBalanceRebuildIntents,
  stageModelWrite,
} from '@/src/data/repositories/AccountingWriteSession';
import type { PreparedAccountMutation } from './accountWriteTypes';

/** Commit a validated account workflow through the shared single-writer session. */
export async function commitAccountMutationPlan<T>(
  prepare: () => Promise<PreparedAccountMutation<T>>,
): Promise<T> {
  return runAccountingWriteSession(async session => {
    const plan = await prepare();
    stageModelWrite(session, plan.prepareOps);
    if (plan.rebuildRequest)
      stageBalanceRebuildIntents(
        session,
        plan.rebuildRequest.workplaceId,
        plan.rebuildRequest.accountIds,
        plan.rebuildRequest.fromDate,
      );
    return plan.result;
  });
}
