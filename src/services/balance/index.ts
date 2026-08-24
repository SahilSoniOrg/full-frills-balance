import Account from '@/src/data/models/Account';
import { AccountBalance } from '@/src/types/domainReadModels';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { Trace } from '@/src/utils/TraceService';
import { balanceHierarchyAggregator } from './balanceHierarchyAggregator';
import { balanceReadService } from './balanceReadService';

export * from './types';
export * from './balanceHierarchyAggregator';
export * from './balanceReadService';

/**
 * BalanceService
 *
 * Delegating façade maintaining backward compatibility and unified access
 * to balance reads and hierarchy aggregation engines.
 */
export class BalanceService {
  aggregateBalances(
    accounts: Account[],
    balancesMap: Map<string, AccountBalance>,
    currencyPrecisionMap: Map<string, number>,
    targetDefaultCurrency?: string,
    parentTrace?: Trace,
  ): Promise<void> {
    return balanceHierarchyAggregator.aggregateBalances(
      accounts,
      balancesMap,
      currencyPrecisionMap,
      targetDefaultCurrency,
      parentTrace,
    );
  }

  getAccountBalance(
    accountId: AccountId,
    workplaceId: WorkplaceId,
    cutoffDate?: number,
  ): Promise<AccountBalance> {
    return balanceReadService.getAccountBalance(accountId, workplaceId, cutoffDate);
  }

  getAccountBalances(
    workplaceId: WorkplaceId,
    asOfDate?: number,
    targetDefaultCurrency?: string,
    parentTrace?: Trace,
  ): Promise<AccountBalance[]> {
    return balanceReadService.getAccountBalances(
      workplaceId,
      asOfDate,
      targetDefaultCurrency,
      parentTrace,
    );
  }
}

export const balanceService = new BalanceService();
