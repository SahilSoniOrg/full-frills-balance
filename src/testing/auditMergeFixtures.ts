import { accountWriteRepository } from '@/src/data/repositories/account';
import { AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

export async function createAuditMergeAccount(
  workplaceId: WorkplaceId,
  name: string,
  parentAccountId?: AccountId,
  orderNum?: number,
) {
  return accountWriteRepository.create({
    name,
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId,
    parentAccountId,
    orderNum,
  });
}
