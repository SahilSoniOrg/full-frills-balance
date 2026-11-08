import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import {
  runAccountingWriteSession,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { preferences } from '@/src/services/preferences';
import { AccountType } from '@/src/types/enums';
import { asAccountId, type AccountId, type WorkplaceId } from '@/src/types/ids';
import {
  captureRoleMappingsAreEligible,
  createCaptureAccountIndex,
} from '@/src/domain/transaction-intelligence/captureAccountEligibility';

type Accounts = Awaited<ReturnType<typeof accountQueryRepository.findAll>>;

function mappingsAreEligible(accounts: Accounts, mappings: Record<string, AccountId>): boolean {
  return captureRoleMappingsAreEligible(createCaptureAccountIndex(accounts), mappings);
}

async function provisionRoles(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  initial: Record<string, AccountId>,
): Promise<Record<string, AccountId>> {
  const mappings = { ...initial };
  const accounts = await accountQueryRepository.findAll(workplaceId);
  const accountIndex = createCaptureAccountIndex(accounts);
  const currencies = accountIndex.financialCurrencies;
  if (!currencies.length)
    throw new Error('Add a financial account before configuring automatic capture.');
  for (const currencyCode of currencies) {
    for (const kind of ['expense', 'income'] as const) {
      const key = `${kind}:${currencyCode}`;
      const accountType = kind === 'expense' ? AccountType.EXPENSE : AccountType.INCOME;
      const id = mappings[key] ?? asAccountId(`capture-${workplaceId}-${kind}-${currencyCode}`);
      const existing = await accountQueryRepository.findWithDeleted(workplaceId, id);
      if (existing) {
        if (!accountIndex.isCategoryLeaf(id, kind, currencyCode))
          throw new Error(
            `Restore an eligible Uncategorized ${kind} account for ${currencyCode} before configuring capture.`,
          );
      } else {
        if (mappings[key])
          throw new Error(
            `Restore the mapped Uncategorized ${kind} account for ${currencyCode} before configuring capture.`,
          );
        // Role identity comes from the mapping or deterministic ID, never a display name.
        const baseName = `Uncategorized ${kind} (${currencyCode})`;
        let name = baseName;
        let suffix = 2;
        while (accounts.some(account => account.name.toLowerCase() === name.toLowerCase()))
          name = `${baseName} ${suffix++}`;
        await accountWriteRepository.createInSession(
          session,
          {
            id,
            name,
            accountType,
            currencyCode,
            workplaceId,
            description: 'Transactions awaiting categorization',
          },
          { appendWithinSiblingList: true, audit: {} },
        );
      }
      mappings[key] = id;
    }
  }
  return mappings;
}

/** Explicit Workplace permission. The default-true legacy SMS setting is never read here. */
class TransactionCaptureService {
  private readonly generations = new Map<WorkplaceId, number>();
  async getSettings(
    workplaceId: WorkplaceId,
  ): Promise<{ enabled: boolean; enabledAt?: number; needsAccountSetup: boolean }> {
    const config = preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture;
    const accounts = config?.enabled ? await accountQueryRepository.findAll(workplaceId) : [];
    return {
      enabled: config?.enabled === true,
      enabledAt: config?.enabledAt,
      needsAccountSetup:
        config?.enabled === true && !mappingsAreEligible(accounts, config.uncategorizedAccountIds),
    };
  }

  async setEnabled(workplaceId: WorkplaceId, enabled: boolean): Promise<void> {
    const generation = (this.generations.get(workplaceId) ?? 0) + 1;
    this.generations.set(workplaceId, generation);
    // Serialize permission changes with capture writes, including a disable while a scan is queued.
    const provisioned = await runAccountingWriteSession(async session => {
      if (this.generations.get(workplaceId) !== generation) return null;
      const current = preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture;
      if (enabled)
        return {
          expected: current,
          mappings: await provisionRoles(
            session,
            workplaceId,
            current?.uncategorizedAccountIds ?? {},
          ),
        };
      preferences.workplace.update(workplaceId, {
        automaticTransactionCapture: {
          enabled: false,
          uncategorizedAccountIds: current?.uncategorizedAccountIds ?? {},
        },
      });
      return null;
    });
    if (enabled && provisioned) {
      // A second serialized writer establishes the activation cutoff after provisioning commits.
      await runAccountingWriteSession(async () => {
        if (this.generations.get(workplaceId) !== generation) return;
        const current = preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture;
        if (current !== provisioned.expected)
          throw new Error('Automatic capture settings changed. Review them and try again.');
        const merged = { ...provisioned.mappings, ...current?.uncategorizedAccountIds };
        if (!mappingsAreEligible(await accountQueryRepository.findAll(workplaceId), merged))
          throw new Error('Accounts changed during setup. Review them and try again.');
        if (this.generations.get(workplaceId) !== generation) return;
        if (preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture !== current)
          throw new Error('Automatic capture settings changed. Review them and try again.');
        preferences.workplace.update(workplaceId, {
          automaticTransactionCapture: {
            enabled: true,
            enabledAt: Date.now(),
            uncategorizedAccountIds: merged,
          },
        });
      });
    }
  }

  /** Add roles for new account currencies without granting consent or moving its cutoff. */
  async configureNewAccounts(workplaceId: WorkplaceId): Promise<void> {
    const generation = this.generations.get(workplaceId) ?? 0;
    const provisioned = await runAccountingWriteSession(async session => {
      const current = preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture;
      if (
        !current?.enabled ||
        !current.enabledAt ||
        (this.generations.get(workplaceId) ?? 0) !== generation
      )
        throw new Error('Automatic capture settings changed. Review them and try again.');
      return {
        expected: current,
        mappings: await provisionRoles(session, workplaceId, current.uncategorizedAccountIds),
      };
    });
    await runAccountingWriteSession(async () => {
      const current = preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture;
      if (
        !current?.enabled ||
        !current.enabledAt ||
        current !== provisioned.expected ||
        (this.generations.get(workplaceId) ?? 0) !== generation
      )
        throw new Error('Automatic capture settings changed. Review them and try again.');
      const merged = { ...provisioned.mappings, ...current.uncategorizedAccountIds };
      if (!mappingsAreEligible(await accountQueryRepository.findAll(workplaceId), merged))
        throw new Error('Accounts changed during setup. Review them and try again.');
      if ((this.generations.get(workplaceId) ?? 0) !== generation)
        throw new Error('Automatic capture settings changed. Review them and try again.');
      if (preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture !== current)
        throw new Error('Automatic capture settings changed. Review them and try again.');
      preferences.workplace.update(workplaceId, {
        automaticTransactionCapture: { ...current, uncategorizedAccountIds: merged },
      });
    });
  }
}

export const transactionCaptureService = new TransactionCaptureService();
