import { accountWriteRepository } from '@/src/data/repositories/account';
import { AccountType } from '@/src/types/enums';
import type { AccountId, WorkplaceId } from '@/src/types/ids';

export async function seedBasicAssetExpenseAccounts(
  workplaceId: WorkplaceId,
  options: {
    assetName?: string;
    expenseName?: string;
    currencyCode?: string;
  } = {},
): Promise<{ assetId: AccountId; expenseId: AccountId }> {
  const currencyCode = options.currencyCode ?? 'USD';
  const asset = await accountWriteRepository.create({
    name: options.assetName ?? 'Checking',
    accountType: AccountType.ASSET,
    currencyCode,
    workplaceId,
  });
  const expense = await accountWriteRepository.create({
    name: options.expenseName ?? 'Rent',
    accountType: AccountType.EXPENSE,
    currencyCode,
    workplaceId,
  });
  return { assetId: asset.id, expenseId: expense.id };
}
