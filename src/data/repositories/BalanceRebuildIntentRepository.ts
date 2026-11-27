import { database } from '@/src/data/database/Database';
import BalanceRebuildIntent from '@/src/data/models/BalanceRebuildIntent';
import { fetchSequentiallyInChunks } from './fetchSequentiallyInChunks';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import { type Model, Q } from '@nozbe/watermelondb';
import { filter } from 'rxjs';
import { generator } from '@/src/utils/idGenerator';

export interface BalanceRebuildRequest {
  workplaceId: WorkplaceId;
  accountId: AccountId;
  fromDate: number;
  peopleSettlementJournalDate?: number;
}

export interface BalanceRebuildClaim extends BalanceRebuildRequest {
  id: string;
  revision: string;
}

export function balanceRebuildKey(workplaceId: WorkplaceId, accountId: AccountId): string {
  return JSON.stringify([workplaceId, accountId]);
}

function intents() {
  return database.collections.get<BalanceRebuildIntent>('balance_rebuild_intents');
}

export const balanceRebuildIntentRepository = {
  /** Resolve upserts under the accounting writer, before any model factories run. */
  async prepareUpserts(requests: readonly BalanceRebuildRequest[]): Promise<() => Model[]> {
    const byWorkplace = new Map<WorkplaceId, Map<AccountId, BalanceRebuildRequest>>();
    for (const request of requests) {
      const { workplaceId, accountId, fromDate } = request;
      const accounts = byWorkplace.get(workplaceId) ?? new Map<AccountId, BalanceRebuildRequest>();
      const previous = accounts.get(accountId);
      accounts.set(accountId, {
        ...request,
        fromDate: Math.min(previous?.fromDate ?? fromDate, fromDate),
        peopleSettlementJournalDate:
          request.peopleSettlementJournalDate === undefined
            ? previous?.peopleSettlementJournalDate
            : Math.max(
                previous?.peopleSettlementJournalDate ?? request.peopleSettlementJournalDate,
                request.peopleSettlementJournalDate,
              ),
      });
      byWorkplace.set(workplaceId, accounts);
    }
    const existing = new Map<string, BalanceRebuildIntent>();
    for (const [workplaceId, accounts] of byWorkplace) {
      const rows = await fetchSequentiallyInChunks([...accounts.keys()], ids =>
        intents()
          .query(Q.where('workplace_id', workplaceId), Q.where('account_id', Q.oneOf([...ids])))
          .fetch(),
      );
      for (const row of rows) existing.set(balanceRebuildKey(row.workplaceId, row.accountId), row);
    }

    return () => {
      const operations: Model[] = [];
      for (const [workplaceId, accounts] of byWorkplace) {
        for (const [accountId, request] of accounts) {
          const { fromDate, peopleSettlementJournalDate } = request;
          const key = balanceRebuildKey(workplaceId, accountId);
          const row = existing.get(key);
          operations.push(
            row
              ? row.prepareUpdate(record => {
                  record.fromDate = Math.min(record.fromDate, fromDate);
                  record.peopleSettlementJournalDate =
                    Math.max(
                      record.peopleSettlementJournalDate ?? peopleSettlementJournalDate ?? 0,
                      peopleSettlementJournalDate ?? 0,
                    ) || undefined;
                  record.revision = generator();
                })
              : intents().prepareCreate(record => {
                  record._raw.id = key;
                  record.workplaceId = workplaceId;
                  record.accountId = accountId;
                  record.fromDate = fromDate;
                  record.peopleSettlementJournalDate = peopleSettlementJournalDate;
                  record.revision = generator();
                }),
          );
        }
      }
      return operations;
    };
  },

  async importPending(requests: readonly BalanceRebuildRequest[]): Promise<void> {
    if (!requests.length) return;
    await database.write(async () => {
      const prepare = await this.prepareUpserts(requests);
      await database.batch(prepare());
    });
  },

  changes() {
    return intents().changes.pipe(
      filter(changes => changes.some(change => change.type !== 'destroyed')),
    );
  },

  async listPending(): Promise<BalanceRebuildClaim[]> {
    const rows = await intents().query(Q.sortBy('created_at', Q.asc)).fetch();
    return rows.map(
      ({ id, revision, workplaceId, accountId, fromDate, peopleSettlementJournalDate }) => ({
        id,
        revision,
        workplaceId,
        accountId,
        fromDate,
        peopleSettlementJournalDate,
      }),
    );
  },

  /** Call under the same writer that will publish the calculated balances. */
  async findCurrent(claim: BalanceRebuildClaim): Promise<BalanceRebuildIntent | undefined> {
    const [row] = await intents().query(Q.where('id', claim.id)).fetch();
    if (row?.revision === claim.revision) return row;
  },

  /**
   * Atomically publish a rebuild projection and retire the claim when it is still current.
   * Owns the database.write seam so services stay outside direct persistence writes.
   */
  async commitClaimWithProjection(
    claim: BalanceRebuildClaim,
    isCurrent: () => boolean,
    prepare: () => Model[] | undefined,
  ): Promise<'rebuilt' | 'superseded' | 'deferred'> {
    let outcome: 'rebuilt' | 'superseded' | 'deferred' = 'deferred';
    await database.write(async () => {
      const row = await this.findCurrent(claim);
      if (!isCurrent()) return;
      if (!row) {
        outcome = 'superseded';
        return;
      }
      const projectionOps = prepare();
      if (projectionOps === undefined) return;
      await database.batch([...projectionOps, row.prepareDestroyPermanently()]);
      outcome = 'rebuilt';
    });
    return outcome;
  },
};
