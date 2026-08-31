import { accountQueryRepository } from '@/src/data/repositories/account/AccountQueryRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { AccountType } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import type { IconName } from '@/src/types/domainIcons';

export interface ImportedWorkplaceSummary {
  workplaceName: string;
  workplaceIcon: IconName;
  currencyCode: string;
  accountCount: number;
  categoryCount: number;
}

/** Reads the inactive imported Workplace that onboarding is currently reviewing. */
export async function readImportedWorkplaceSummary(
  workplaceId: WorkplaceId,
): Promise<ImportedWorkplaceSummary | null> {
  const [workplace, accounts] = await Promise.all([
    workplaceRepository.find(workplaceId),
    accountQueryRepository.findAll(workplaceId),
  ]);

  if (!workplace) return null;

  return {
    workplaceName: workplace.name,
    workplaceIcon: workplace.icon as IconName,
    currencyCode: workplace.defaultCurrencyCode,
    accountCount: accounts.filter(
      account =>
        account.accountType === AccountType.ASSET || account.accountType === AccountType.LIABILITY,
    ).length,
    categoryCount: accounts.filter(
      account =>
        account.accountType === AccountType.INCOME || account.accountType === AccountType.EXPENSE,
    ).length,
  };
}
