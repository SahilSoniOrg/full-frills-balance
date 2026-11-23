import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { cashClarityPublicationRepository } from '@/src/data/repositories/CashClarityPublicationRepository';
import {
  runAccountingWriteSession,
  stageBalanceRebuildIntents,
  stageModelWrite,
} from '@/src/data/repositories/AccountingWriteSession';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import type {
  JournalPersistenceResult,
  JournalRebuildImpact,
} from '@/src/data/repositories/journal/journalPersistenceTypes';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { journalLegTypesForSignedAmount } from '@/src/services/accounts/accountRules';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { buildCreatePersistenceInput } from '@/src/services/planned-payment/plannedPaymentSchedulePolicy';
import { workplaceService } from '@/src/services/WorkplaceService';
import { generateWorkplaceName } from '@/src/services/setup/workplaceName';
import { AuditAction, JournalStatus, PlannedPaymentInterval } from '@/src/types/enums';
import { asAccountId, type WorkplaceId } from '@/src/types/ids';
import dayjs from 'dayjs';
import {
  CashClarityPublicationError,
  cashClarityPublicationReceiptId,
  type CashClarityPublicationManifest,
  type CashClarityPublicationOutcome,
  type CashClarityPublicationPlan,
} from './cashClarityPublicationTypes';

type AtomicPublicationResult = {
  readonly status: CashClarityPublicationOutcome['status'];
  readonly workplaceId: WorkplaceId;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function readManifest(receipt: {
  parsedChanges: Record<string, unknown> | null;
}): CashClarityPublicationManifest | undefined {
  const after = receipt.parsedChanges?.after;
  if (!isRecord(after)) return undefined;
  const hasRebuildAccounts = after.balanceRebuildAccountIds !== undefined;
  const hasRebuildDate = after.balanceRebuildFromDate !== undefined;
  if (
    typeof after.operationId !== 'string' ||
    !isStringArray(after.accountIds) ||
    !isStringArray(after.journalIds) ||
    !isStringArray(after.plannedPaymentIds) ||
    !isStringArray(after.budgetIds) ||
    !isStringArray(after.budgetScopeIds) ||
    hasRebuildAccounts !== hasRebuildDate ||
    (hasRebuildAccounts && !isStringArray(after.balanceRebuildAccountIds)) ||
    (hasRebuildDate &&
      !(
        after.balanceRebuildFromDate === null ||
        (typeof after.balanceRebuildFromDate === 'number' &&
          Number.isFinite(after.balanceRebuildFromDate) &&
          after.balanceRebuildFromDate > 0)
      )) ||
    (hasRebuildAccounts &&
      (after.balanceRebuildAccountIds as string[]).length > 0 &&
      after.balanceRebuildFromDate === null) ||
    (hasRebuildAccounts &&
      (after.journalIds as string[]).length > 0 !==
        (after.balanceRebuildAccountIds as string[]).length > 0)
  ) {
    return undefined;
  }
  return {
    operationId: after.operationId,
    accountIds: after.accountIds,
    journalIds: after.journalIds,
    plannedPaymentIds: after.plannedPaymentIds,
    budgetIds: after.budgetIds,
    budgetScopeIds: after.budgetScopeIds,
    ...(hasRebuildAccounts
      ? { balanceRebuildAccountIds: after.balanceRebuildAccountIds as string[] }
      : {}),
    ...(hasRebuildDate
      ? { balanceRebuildFromDate: after.balanceRebuildFromDate as number | null }
      : {}),
  };
}

/** One manifest describing every row this publication owns, derived from the plan alone. */
function buildManifest(plan: CashClarityPublicationPlan): CashClarityPublicationManifest {
  return {
    operationId: plan.operationId,
    accountIds: [
      asAccountId(`${plan.operationId}:system:opening-balances`),
      asAccountId(`${plan.operationId}:system:balance-corrections`),
      ...plan.workplace.accounts.map(account => account.id),
    ],
    journalIds: plan.openingBalances.map(balance => balance.journalId),
    plannedPaymentIds: plan.plannedPayments.map(payment => payment.id),
    budgetIds: plan.budgets.map(budget => budget.id),
    budgetScopeIds: plan.budgets.flatMap(budget =>
      budget.categoryAccountIds.map(categoryId => `${budget.id}:scope:${categoryId}`),
    ),
    balanceRebuildAccountIds: [],
    balanceRebuildFromDate: null,
  };
}

async function verifyCompletedPublication(
  workplaceId: WorkplaceId,
  receipt: NonNullable<Awaited<ReturnType<typeof auditRepository.find>>>,
): Promise<JournalRebuildImpact> {
  const manifest = readManifest(receipt);
  if (
    receipt.eventType !== 'workplace.setup_published' ||
    receipt.entityId !== workplaceId ||
    manifest?.operationId !== workplaceId ||
    !manifest
  ) {
    throw new CashClarityPublicationError(
      'incomplete_publication',
      'The saved setup receipt is incomplete. Keep this setup for recovery.',
    );
  }
  if (!(await cashClarityPublicationRepository.hasCompletePublication(workplaceId, manifest))) {
    throw new CashClarityPublicationError(
      'incomplete_publication',
      'Saved setup records are incomplete. Keep this setup for recovery.',
    );
  }
  let accountIds: string[];
  let fromDate: number | null;
  if (
    manifest.balanceRebuildAccountIds !== undefined &&
    manifest.balanceRebuildFromDate !== undefined
  ) {
    accountIds = manifest.balanceRebuildAccountIds;
    fromDate = manifest.balanceRebuildFromDate;
  } else {
    const recovered = await cashClarityPublicationRepository.findBalanceRebuildImpact(
      workplaceId,
      manifest.journalIds,
    );
    accountIds = [...recovered.accountIds];
    fromDate = recovered.fromDate;
  }
  if (
    accountIds.some(id => !manifest.accountIds.includes(id)) ||
    (manifest.journalIds.length > 0 && (accountIds.length === 0 || fromDate === null))
  ) {
    throw new CashClarityPublicationError(
      'incomplete_publication',
      'Saved opening balances are incomplete. Keep this setup for recovery.',
    );
  }
  return {
    affectedAccountIds: new Set(accountIds.map(asAccountId)),
    rebuildFromDate: fromDate ?? Date.now(),
  };
}

async function uniqueDefaultName(name: string, isDefault: boolean): Promise<string> {
  if (!isDefault) return name;
  const existingNames = new Set(
    (await workplaceService.getAllWorkplaces()).map(workplace => workplace.name.toLowerCase()),
  );
  if (!existingNames.has(name.toLowerCase())) return name;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = generateWorkplaceName();
    if (!existingNames.has(candidate.toLowerCase())) return candidate;
  }
  let suffix = 2;
  while (existingNames.has(`${name} ${suffix}`.toLowerCase())) suffix += 1;
  return `${name} ${suffix}`;
}

/** Publishes all Cash Clarity books and its completion receipt in one database transaction. */
export async function publishCashClarityBooks(
  plan: CashClarityPublicationPlan,
): Promise<CashClarityPublicationOutcome> {
  const { operationId } = plan;
  const manifest = buildManifest(plan);

  let result: AtomicPublicationResult;
  try {
    result = await runAccountingWriteSession<AtomicPublicationResult>(async session => {
      const receipt = await auditRepository.find(
        cashClarityPublicationReceiptId(operationId),
        operationId,
      );
      if (receipt) {
        const existingWorkplace = await workplaceRepository.find(operationId);
        if (!existingWorkplace) {
          throw new CashClarityPublicationError(
            'incomplete_publication',
            'The setup receipt exists without its Workplace. Keep this setup for recovery.',
          );
        }
        const impact = await verifyCompletedPublication(operationId, receipt);
        stageBalanceRebuildIntents(
          session,
          operationId,
          impact.affectedAccountIds,
          impact.rebuildFromDate,
        );
        return { status: 'already_published' as const, workplaceId: operationId };
      }

      if (await workplaceRepository.find(operationId)) {
        throw new CashClarityPublicationError(
          'ambiguous_existing_publication',
          'This Workplace was created by an older partial save and needs recovery before retrying.',
        );
      }

      let workplaceName: string;
      try {
        workplaceName = await uniqueDefaultName(
          plan.workplace.name,
          plan.workplace.nameIsDefault && !plan.preserveWorkplaceName,
        );
      } catch (cause) {
        throw new CashClarityPublicationError('save_failed', 'Could not save setup.', { cause });
      }

      await workplaceRepository.createSetupInSession(session, {
        id: operationId,
        name: workplaceName,
        icon: plan.workplace.icon,
        defaultCurrencyCode: plan.workplace.defaultCurrencyCode,
        accounts: plan.workplace.accounts.map(account => ({ ...account, workplaceId: operationId })),
      });

      const openingId = asAccountId(`${operationId}:system:opening-balances`);
      const journalResults: JournalPersistenceResult[] = [];
      for (const balance of plan.openingBalances) {
        const legTypes = journalLegTypesForSignedAmount(balance.accountType, balance.signedAmount);
        journalResults.push(
          await journalPersistenceService.putInSession(
            session,
            {
              createJournalId: balance.journalId,
              journalDate: Date.now(),
              description: balance.description,
              currencyCode: plan.workplace.defaultCurrencyCode,
              status: JournalStatus.POSTED,
              transactions: [
                {
                  accountId: balance.accountId,
                  amount: Math.abs(balance.signedAmount),
                  transactionType: legTypes.accountTxType,
                },
                {
                  accountId: openingId,
                  amount: Math.abs(balance.signedAmount),
                  transactionType: legTypes.balancingTxType,
                },
              ],
            },
            operationId,
            { source: 'system', eventType: 'journal.opening_balance_created', undoable: false },
          ),
        );
      }

      for (const payment of plan.plannedPayments) {
        await plannedPaymentRepository.createInSession(
          session,
          operationId,
          payment.id,
          buildCreatePersistenceInput(payment.input),
          operationId,
        );
      }

      if (plan.budgets.length > 0) {
        const now = dayjs();
        for (const budget of plan.budgets) {
          await budgetRepository.createInSession(
            session,
            operationId,
            budget.id,
            {
              name: budget.name,
              amount: budget.amount,
              currencyCode: plan.workplace.defaultCurrencyCode,
              startMonth: now.format('YYYY-MM'),
              intervalType: PlannedPaymentInterval.MONTHLY,
              intervalN: 1,
              startDate: now.startOf('month').valueOf(),
              recurrenceDay: 1,
              assetAccountIds: [budget.assetAccountId],
            },
            [...budget.categoryAccountIds],
            operationId,
          );
        }
      }

      const affectedAccountIds = new Set(
        journalResults.flatMap(result => [...result.affectedAccountIds]),
      );
      const rebuildFromDate = journalResults.length
        ? Math.min(...journalResults.map(result => result.rebuildFromDate))
        : null;
      manifest.balanceRebuildAccountIds = [...affectedAccountIds];
      manifest.balanceRebuildFromDate = rebuildFromDate;
      stageModelWrite(session, [
        auditRepository.prepareLog(
          {
            id: cashClarityPublicationReceiptId(operationId),
            entityType: 'workplace',
            entityId: operationId,
            action: AuditAction.CREATE,
            eventType: 'workplace.setup_published',
            source: 'system',
            correlationId: operationId,
            undoable: false,
            changes: { after: manifest },
          },
          operationId,
        ),
      ]);
      return { status: 'published' as const, workplaceId: operationId };
    });
  } catch (cause) {
    if (cause instanceof CashClarityPublicationError) throw cause;
    throw new CashClarityPublicationError('save_failed', 'Could not save setup.', { cause });
  }

  return { workplaceId: result.workplaceId, status: result.status };
}

/** Verify saved books and replay derived effects without accepting another creation payload. */
export async function recoverCashClarityBooks(
  workplaceId: WorkplaceId,
): Promise<CashClarityPublicationOutcome> {
  try {
    await runAccountingWriteSession(async session => {
      const receipt = await auditRepository.find(
        cashClarityPublicationReceiptId(workplaceId),
        workplaceId,
      );
      const workplace = await workplaceRepository.find(workplaceId);
      if (!receipt || !workplace) {
        throw new CashClarityPublicationError(
          workplace && !receipt ? 'ambiguous_existing_publication' : 'incomplete_publication',
          'Saved setup needs recovery before it can be opened.',
        );
      }
      const impact = await verifyCompletedPublication(workplaceId, receipt);
      stageBalanceRebuildIntents(
        session,
        workplaceId,
        impact.affectedAccountIds,
        impact.rebuildFromDate,
      );
    });
    return { workplaceId, status: 'already_published' };
  } catch (cause) {
    if (cause instanceof CashClarityPublicationError) throw cause;
    throw new CashClarityPublicationError(
      'finalization_failed',
      'Books are saved, but setup could not finish. Try again.',
      { cause },
    );
  }
}
