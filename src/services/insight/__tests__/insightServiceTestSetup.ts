import { AccountSubtype, AccountType } from '@/src/types/enums';
import { accountObserveQueries } from '@/src/data/repositories/account';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawPatternQueries } from '@/src/data/repositories/raw/TransactionRawPatternQueries';
import { transactionInsightQueries } from '@/src/data/repositories/transaction/TransactionInsightQueries';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { insightService as patternService } from '@/src/services/insight/InsightService';
import {
  reactiveCacheCoordinator,
  REACTIVE_CACHE_NAMESPACES,
} from '@/src/services/reactive/ReactiveCacheCoordinator';
import { of } from 'rxjs';

export function resetInsightServiceTestState() {
  jest.clearAllMocks();
  reactiveCacheCoordinator.clearNamespaces([
    REACTIVE_CACHE_NAMESPACES.workplaceAccounts,
    REACTIVE_CACHE_NAMESPACES.workplaceJournalMeta,
    REACTIVE_CACHE_NAMESPACES.workplaceActiveCount,
  ]);
  patternService.clearCache();

  (accountObserveQueries.observeAll as jest.Mock).mockReturnValue(of([]));
  (journalQueryRepository.findByIds as jest.Mock).mockResolvedValue([]);
  (plannedPaymentRepository.observeActive as jest.Mock).mockReturnValue(of([]));
  (transactionQueryRepository.findByAccountsAndDateRange as jest.Mock).mockResolvedValue([]);
  (transactionQueryRepository.findByJournals as jest.Mock).mockResolvedValue([]);
  (journalObserveQueries.observeStatusMeta as jest.Mock).mockReturnValue(
    of({ count: 1, lastUpdatedAt: new Date() }),
  );
  (transactionRawPatternQueries.getRecurringPatternsRaw as jest.Mock).mockResolvedValue([]);
  (transactionInsightQueries.findActiveMetadata as jest.Mock).mockResolvedValue([]);
}

export const emergencyFundAssetAccounts = [
  { id: 'a1', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.BANK_CHECKING },
  { id: 'a2', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.RETIREMENT },
  { id: 'a3', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.INVESTMENT },
  { id: 'a4', accountType: AccountType.ASSET, accountSubtype: AccountSubtype.INVESTMENT },
];
