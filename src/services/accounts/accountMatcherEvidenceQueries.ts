import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { transactionObserveQueries } from '@/src/data/repositories/transaction';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import type { AccountMatcherDiscoveryMessage } from '@/src/services/sms/recognition/accountMatcherDiscovery';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import { combineLatest, map, skip } from 'rxjs';
import { projectAccountMatcherMembership } from './accountMatcherMembership';

export const ACCOUNT_MATCHER_EVIDENCE_LIMIT = 200;

export interface AccountMatcherEvidenceData {
  evidence: AccountMatcherDiscoveryMessage[];
  comparisonMessages: AccountMatcherDiscoveryMessage[];
  latestLinkTime: number;
}

/**
 * Reads linked SMS using current journal lines. It intentionally ignores inbox account hints and
 * derives every Account association from non-deleted transactions in this Workplace.
 */
export async function loadAccountMatcherEvidence(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  limit = ACCOUNT_MATCHER_EVIDENCE_LIMIT,
): Promise<AccountMatcherEvidenceData> {
  const [targetMessages, recentMessages, accounts] = await Promise.all([
    transactionInboxRepository.findRecentLinkedToAccount(workplaceId, accountId, limit),
    transactionInboxRepository.findRecentSms(workplaceId, limit),
    accountQueries.findAll(workplaceId),
  ]);
  const messagesById = new Map(
    [...targetMessages, ...recentMessages].map(message => [message.id, message]),
  );
  const projected = await projectAccountMatcherMembership(
    workplaceId,
    [...messagesById.values()],
    accounts,
  );
  const projectedById = new Map(projected.map(message => [message.id, message]));
  const evidence = targetMessages
    .map(message => projectedById.get(message.id)!)
    .filter(message => message.linkedAccountIds.includes(accountId));
  const comparisonMessages = recentMessages
    .map(message => projectedById.get(message.id)!)
    .filter(message => message.linkedAccountIds.length > 0);
  const latestLinkTime = Math.max(
    0,
    ...evidence.map(message => message.processedAt ?? message.lastScannedAt ?? message.inputDate),
  );
  return { evidence, comparisonMessages, latestLinkTime };
}

/** Signals evidence changes without loading historical SMS or transaction models. */
export function observeAccountMatcherEvidenceChanges(workplaceId: WorkplaceId) {
  const transactions = transactionObserveQueries.observeMatcherDiscoveryChanges(workplaceId);
  const links = transactionInboxRepository.observeMatcherDiscoveryEvidence(workplaceId);
  const accounts = accountQueries.observeAll(workplaceId);
  return combineLatest([transactions, links, accounts]).pipe(
    skip(1),
    map(() => undefined),
  );
}
