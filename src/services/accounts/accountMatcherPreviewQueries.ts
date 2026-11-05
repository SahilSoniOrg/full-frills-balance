import { accountMatcherRepository } from '@/src/data/repositories/AccountMatcherRepository';
import type { AccountMatcherSnapshot } from '@/src/types/accountMatcher';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import { map } from 'rxjs/operators';
import { loadAccountMatcherPageData } from './accountMatcherEvidenceQueries';

export type AccountMatcherPreviewData = Awaited<ReturnType<typeof loadAccountMatcherPageData>>;
export type AccountMatcherPreviewMessage = AccountMatcherPreviewData['messages'][number];

export function observeAccountMatcherSnapshots(workplaceId: WorkplaceId, accountId: AccountId) {
  return accountMatcherRepository.observeForAccount(workplaceId, accountId).pipe(
    map(matchers =>
      matchers.map(
        matcher =>
          ({
            id: matcher.id,
            accountId: matcher.accountId,
            definitionJson: matcher.definitionJson,
            conditionsKey: matcher.conditionsKey,
            isEnabled: matcher.isEnabled,
          }) satisfies AccountMatcherSnapshot,
      ),
    ),
  );
}

/** Editor data comes from the same account-scoped snapshot as matcher management. */
export function loadAccountMatcherPreviewData(
  workplaceId: WorkplaceId,
  accountId: AccountId,
): Promise<AccountMatcherPreviewData> {
  return loadAccountMatcherPageData(workplaceId, accountId);
}
