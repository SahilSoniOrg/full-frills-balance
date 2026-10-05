import { AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { resetDatabase } from '@/src/testing/resetDatabase';

export type BudgetReadServiceHarnessIds = {
  assetId: string;
  expenseParentId: string;
  expenseChildId: string;
};

export async function resetBudgetReadServiceDatabase(): Promise<BudgetReadServiceHarnessIds> {
  await resetDatabase();
  const asset = await accountWriteRepository.create({
    name: 'Checking',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId: 'wp-1' as WorkplaceId,
  });
  const parent = await accountWriteRepository.create({
    name: 'Food',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
    workplaceId: 'wp-1' as WorkplaceId,
  });
  const child = await accountWriteRepository.create({
    name: 'Groceries',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
    parentAccountId: parent.id,
    workplaceId: 'wp-1' as WorkplaceId,
  });
  return {
    assetId: asset.id,
    expenseParentId: parent.id,
    expenseChildId: child.id,
  };
}
