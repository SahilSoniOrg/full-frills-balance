import { database } from '@/src/data/database/Database';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { AccountType } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';

export async function resetPlannedPaymentDatabase() {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}

export async function seedPlannedPaymentWorkplace(workplaceId: WorkplaceId) {
  await resetPlannedPaymentDatabase();
  const from = await accountWriteRepository.create({
    name: 'Checking',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId,
  });
  const to = await accountWriteRepository.create({
    name: 'Rent',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
    workplaceId,
  });
  return { fromAccountId: from.id, toAccountId: to.id };
}

export function mockPlannedFxExchangeRates(spotRate = 0.9, historicalRate = 0.8, asOf?: number) {
  jest.spyOn(exchangeRateService, 'getRequiredRate').mockResolvedValue(spotRate);
  jest.spyOn(exchangeRateService, 'getHistoricalRate').mockResolvedValue({
    rate: historicalRate,
    requestedDate: asOf ?? Date.now(),
    effectiveDate: asOf ?? Date.now(),
    source: 'test',
  });
}
