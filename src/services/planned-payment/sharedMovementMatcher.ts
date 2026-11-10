import { database } from '@/src/data/database/Database';
import type Account from '@/src/data/models/Account';
import type Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import PlannedPayment, { toPlainPlannedPayment } from '@/src/data/models/PlannedPayment';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { accountQueryRepository } from '@/src/data/repositories/account/AccountQueryRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import {
  findCaptureReferenceCandidates,
  findCaptureReferenceMatches,
} from '@/src/data/repositories/journal/CaptureReferenceMatchQueries';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { smsJournalQueries } from '@/src/data/repositories/journal/SmsJournalQueries';
import { transactionQueryRepository } from '@/src/data/repositories/transaction/TransactionQueryRepository';
import {
  MOVEMENT_MATCH_WINDOWS,
  matchSharedMovement,
  type ExistingMovement,
  type MovementChannel,
  type MovementMatchFacts,
  type MovementMatchResult,
  type MovementObservation,
  type MovementOccurrence,
} from '@/src/domain/planned-payment/sharedMovementMatcher';
import { readCaptureMetadata } from '@/src/domain/transaction-intelligence/captureMetadata';
import { MetadataKeys } from '@/src/constants/ledger-constants';
import {
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  TransactionDirection,
  TransactionType,
} from '@/src/types/enums';
import type { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import type { InboxRecordSnapshot } from '@/src/types/smsInbox';
import { safeParseJSON } from '@/src/utils/serialization';
import { Q } from '@nozbe/watermelondb';
import { inferSimpleJournalTypeFromAccounts } from './inferSimpleJournalTypeFromAccounts';
import { projectPlannedOccurrencesForHorizon } from './plannedOccurrenceHorizon';
import { normalizeToStartOfDay } from './plannedPaymentRecurrence';
import { classifyPlannedPaymentDirection } from './plannedPaymentReadService';

const DAY_MS = 86_400_000;
const PENDING_LIMIT = 200;

/** Repository adapter keeps WatermelonDB out of the matcher and its unit tests. */
export interface SharedMovementMatchLoader {
  loadFacts(observation: MovementObservation): Promise<Omit<MovementMatchFacts, 'observation'>>;
}

export type SharedMovementMatchLoaderDeps = {
  findAllActive: (workplaceId: WorkplaceId) => Promise<PlannedPayment[]>;
  findAccountsByIds: (workplaceId: WorkplaceId, ids: AccountId[]) => Promise<Account[]>;
  findLinkedForMatcher: (
    workplaceId: WorkplaceId,
    plannedPaymentIds: PlannedPaymentId[],
    recentStart: number,
    recentEnd: number,
  ) => Promise<Journal[]>;
  findUnlinkedPostedNear: typeof smsJournalQueries.findUnlinkedPostedNear;
  findTransactionsByJournals: typeof transactionQueryRepository.findByJournals;
  findPendingSms: (workplaceId: WorkplaceId, limit: number) => Promise<InboxRecordSnapshot[]>;
  findPendingEmail: (workplaceId: WorkplaceId, limit: number) => Promise<InboxRecordSnapshot[]>;
  findReferenceMatches: typeof findCaptureReferenceMatches;
  findReferenceCandidates: typeof findCaptureReferenceCandidates;
  loadJournalMetadata: (
    workplaceId: WorkplaceId,
    journalIds: JournalId[],
  ) => Promise<JournalMetadata[]>;
  findInboxLinkedToJournals: (
    workplaceId: WorkplaceId,
    journalIds: JournalId[],
  ) => Promise<{ journalId: JournalId; channel: MovementChannel; reference?: string | null }[]>;
  now: () => number;
};

function defaultDeps(): SharedMovementMatchLoaderDeps {
  return {
    findAllActive: workplaceId => plannedPaymentRepository.findAllActive(workplaceId),
    findAccountsByIds: (workplaceId, ids) => accountQueryRepository.findAllByIds(workplaceId, ids),
    findLinkedForMatcher: (workplaceId, plannedPaymentIds, recentStart, recentEnd) =>
      journalPlannedQueries.findLinkedForMatcher(
        workplaceId,
        plannedPaymentIds,
        recentStart,
        recentEnd,
      ),
    findUnlinkedPostedNear: (params, workplaceId) =>
      smsJournalQueries.findUnlinkedPostedNear(params, workplaceId),
    findTransactionsByJournals: (workplaceId, journalIds) =>
      transactionQueryRepository.findByJournals(workplaceId, journalIds),
    findPendingSms: (workplaceId, limit) =>
      transactionInboxRepository.findRecentPendingSms(workplaceId, limit),
    findPendingEmail: (workplaceId, limit) =>
      transactionInboxRepository.findRecentPendingEmail(workplaceId, limit),
    findReferenceMatches: findCaptureReferenceMatches,
    findReferenceCandidates: findCaptureReferenceCandidates,
    loadJournalMetadata: loadJournalMetadataRows,
    findInboxLinkedToJournals: loadInboxLinksForJournals,
    now: () => Date.now(),
  };
}

async function loadJournalMetadataRows(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
): Promise<JournalMetadata[]> {
  if (journalIds.length === 0) return [];
  return database.collections
    .get<JournalMetadata>('journal_metadata')
    .query(Q.where('workplace_id', workplaceId), Q.where('journal_id', Q.oneOf(journalIds)))
    .fetch();
}

async function loadInboxLinksForJournals(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
): Promise<{ journalId: JournalId; channel: MovementChannel; reference?: string | null }[]> {
  if (journalIds.length === 0) return [];
  const records = await database.collections
    .get<TransactionInboxRecord>('transaction_inbox_records')
    .query(Q.where('workplace_id', workplaceId), Q.where('linked_journal_id', Q.oneOf(journalIds)))
    .fetch();
  return records.flatMap(row =>
    row.linkedJournalId
      ? [
          {
            journalId: row.linkedJournalId,
            channel: row.channel as MovementChannel,
            reference: row.referenceNumber ?? null,
          },
        ]
      : [],
  );
}

function intervalDays(intervalN: number, intervalType: PlannedPaymentInterval): number {
  const n = Math.max(1, intervalN || 1);
  switch (intervalType) {
    case PlannedPaymentInterval.DAILY:
      return n;
    case PlannedPaymentInterval.WEEKLY:
      return n * 7;
    case PlannedPaymentInterval.YEARLY:
      return n * 365;
    case PlannedPaymentInterval.MONTHLY:
    default:
      return n * 30;
  }
}

function mapPlanStatus(status: PlannedPaymentStatus): MovementOccurrence['status'] {
  if (status === PlannedPaymentStatus.PAUSED) return 'paused';
  if (status === PlannedPaymentStatus.COMPLETED) return 'completed';
  return 'active';
}

function observationDirection(direction: string): MovementObservation['direction'] {
  if (direction === TransactionDirection.DEBIT || direction === 'debit') return 'debit';
  if (direction === TransactionDirection.CREDIT || direction === 'credit') return 'credit';
  return 'unknown';
}

/**
 * Dual-leg occurrence identity: always expose from + to accounts. Direction follows
 * the observation's visible account when it hits a known leg; otherwise classify.
 */
function resolveOccurrenceAccounts(
  payment: PlannedPayment,
  accountsById: Map<string, Account>,
  observation: MovementObservation,
): { accountId: string; toAccountId: string; direction: 'debit' | 'credit' } {
  const obsAccount = observation.visibleAccountId ?? observation.accountId;
  const accountId = payment.fromAccountId;
  const toAccountId = payment.toAccountId;
  if (obsAccount === payment.fromAccountId) {
    return { accountId, toAccountId, direction: 'debit' };
  }
  if (obsAccount === payment.toAccountId) {
    return { accountId, toAccountId, direction: 'credit' };
  }
  const fromType = accountsById.get(payment.fromAccountId)?.accountType;
  const toType = accountsById.get(payment.toAccountId)?.accountType;
  const flow = classifyPlannedPaymentDirection(fromType, toType);
  if (flow === 'inflow') return { accountId, toAccountId, direction: 'credit' };
  return { accountId, toAccountId, direction: 'debit' };
}

function structureForPayment(
  payment: PlannedPayment,
  accountsById: Map<string, Account>,
): string | null {
  const fromType = accountsById.get(payment.fromAccountId)?.accountType;
  const toType = accountsById.get(payment.toAccountId)?.accountType;
  return inferSimpleJournalTypeFromAccounts({
    sourceAccountType: fromType,
    destinationAccountType: toType,
  });
}

function readOriginalPlannedDate(
  journal: Journal,
  metadataByJournal: Map<JournalId, JournalMetadata>,
): number | undefined {
  const row = metadataByJournal.get(journal.id);
  if (!row) return undefined;
  const metadataJson = safeParseJSON<Record<string, unknown>>(row.metadataJson, {});
  const raw = metadataJson[MetadataKeys.ORIGINAL_PLANNED_DATE];
  const value = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : Number.NaN;
  return Number.isFinite(value) ? value : undefined;
}

function claimDay(journal: Journal, metadataByJournal: Map<JournalId, JournalMetadata>): number {
  return readOriginalPlannedDate(journal, metadataByJournal) ?? journal.journalDate;
}

function channelFromMetadata(row: JournalMetadata | undefined): MovementChannel | undefined {
  const capture = row ? readCaptureMetadata(row.metadataJson) : null;
  const source = capture?.sources?.[0];
  return source?.channel;
}

function toPendingObservation(record: InboxRecordSnapshot): MovementObservation | null {
  const amount = record.parsedAmount;
  const accountId = record.suggestedSourceAccountId;
  if (amount == null || !Number.isFinite(amount) || !accountId) return null;
  return {
    id: record.id,
    channel: record.channel,
    amount,
    currency: record.parsedCurrencyCode ?? '',
    accountId,
    direction: observationDirection(record.direction),
    date: record.inputDate,
    reference: record.referenceNumber ?? null,
  };
}

/**
 * Concrete repository loader for shared movement matching.
 *
 * Callers must re-validate candidates inside `runAccountingWriteSession` before any
 * mutation (spec Concurrency): reads may happen before a write session in v1, so a
 * second writer can claim an occurrence between load and write.
 */
export function createRepositorySharedMovementMatchLoader(
  workplaceId: WorkplaceId,
  deps: Partial<SharedMovementMatchLoaderDeps> = {},
): SharedMovementMatchLoader {
  const d = { ...defaultDeps(), ...deps };

  return {
    async loadFacts(observation) {
      const today = normalizeToStartOfDay(d.now());
      const softMs = MOVEMENT_MATCH_WINDOWS.softDays * DAY_MS;
      const strictMs = MOVEMENT_MATCH_WINDOWS.strictDays * DAY_MS;
      const recentStart = Math.min(observation.date, today) - softMs - DAY_MS;
      const recentEnd = Math.max(observation.date, today) + softMs + DAY_MS;
      // Soft horizon: project dues through today+softDays so early-debit soft matches load.
      const projectThrough = today + softMs;

      const payments = await d.findAllActive(workplaceId);
      const accountIds = [
        ...new Set(payments.flatMap(payment => [payment.fromAccountId, payment.toAccountId])),
      ];
      const accounts = await d.findAccountsByIds(workplaceId, accountIds);
      const accountsById = new Map(accounts.map(account => [account.id, account]));

      const planIds = payments.map(payment => payment.id);
      const planJournals = await d.findLinkedForMatcher(
        workplaceId,
        planIds,
        recentStart,
        recentEnd,
      );
      const planJournalIds = planJournals.map(journal => journal.id);
      const [metadataRows, inboxLinks] = await Promise.all([
        d.loadJournalMetadata(workplaceId, planJournalIds),
        d.findInboxLinkedToJournals(workplaceId, planJournalIds),
      ]);
      const metadataByJournal = new Map(metadataRows.map(row => [row.journalId, row]));
      const inboxByJournal = new Map(inboxLinks.map(link => [link.journalId, link]));

      const journalsByPlan = new Map<PlannedPaymentId, Journal[]>();
      for (const journal of planJournals) {
        if (!journal.plannedPaymentId) continue;
        const list = journalsByPlan.get(journal.plannedPaymentId) ?? [];
        list.push(journal);
        journalsByPlan.set(journal.plannedPaymentId, list);
      }

      const occurrences: MovementOccurrence[] = [];
      const journals: ExistingMovement[] = [];
      const seenOccurrenceIds = new Set<string>();
      const seenJournalIds = new Set<string>();

      const pushJournal = (movement: ExistingMovement) => {
        if (seenJournalIds.has(movement.id)) return;
        seenJournalIds.add(movement.id);
        journals.push(movement);
      };

      for (const payment of payments) {
        const days = intervalDays(payment.intervalN, payment.intervalType);
        const leg = resolveOccurrenceAccounts(payment, accountsById, observation);
        const structure = structureForPayment(payment, accountsById);
        const status = mapPlanStatus(payment.status);
        const fxMode = payment.fxMode ?? null;
        const linked = journalsByPlan.get(payment.id) ?? [];
        const savedDays = new Set<number>();

        const byDay = new Map<number, Journal[]>();
        for (const journal of linked) {
          const day = normalizeToStartOfDay(
            journal.status === JournalStatus.POSTED || journal.status === JournalStatus.SKIPPED
              ? claimDay(journal, metadataByJournal)
              : journal.journalDate,
          );
          savedDays.add(day);
          const list = byDay.get(day) ?? [];
          list.push(journal);
          byDay.set(day, list);
        }

        for (const [day, dayJournals] of byDay) {
          const settled = dayJournals.find(journal => journal.status !== JournalStatus.PLANNED);
          const planned = dayJournals.filter(journal => journal.status === JournalStatus.PLANNED);

          if (settled) {
            const meta = metadataByJournal.get(settled.id);
            const inbox = inboxByJournal.get(settled.id);
            const channel = inbox?.channel ?? channelFromMetadata(meta);
            const reference = inbox?.reference ?? meta?.referenceNumber ?? null;
            const occurrenceId = settled.id;
            const original = readOriginalPlannedDate(settled, metadataByJournal);
            if (!seenOccurrenceIds.has(occurrenceId)) {
              seenOccurrenceIds.add(occurrenceId);
              occurrences.push({
                id: occurrenceId,
                planId: payment.id,
                status,
                date: day,
                intervalDays: days,
                amount: payment.amount,
                currency: payment.currencyCode,
                accountId: leg.accountId,
                toAccountId: leg.toAccountId,
                direction: leg.direction,
                fxMode,
                skipped: settled.status === JournalStatus.SKIPPED,
                claimed: settled.status === JournalStatus.POSTED ? false : undefined,
                structure,
                visibleAmount: settled.totalAmount,
              });
            }
            if (settled.status === JournalStatus.POSTED) {
              // date = journal_date (obs/money day); originalPlannedDate claims the occurrence.
              pushJournal({
                id: settled.id,
                date: settled.journalDate,
                amount: settled.totalAmount,
                currency: settled.currencyCode,
                accountId: leg.accountId,
                direction: leg.direction,
                reference,
                channel,
                linked: Boolean(inbox),
                planLinked: true,
                status: 'posted',
                structure,
                originalPlannedDate: original ?? day,
              });
            }
            continue;
          }

          for (const journal of planned) {
            if (seenOccurrenceIds.has(journal.id)) continue;
            seenOccurrenceIds.add(journal.id);
            occurrences.push({
              id: journal.id,
              planId: payment.id,
              status,
              date: day,
              intervalDays: days,
              amount: payment.amount,
              currency: payment.currencyCode,
              accountId: leg.accountId,
              toAccountId: leg.toAccountId,
              direction: leg.direction,
              fxMode,
              structure,
              visibleAmount: journal.totalAmount,
            });
            pushJournal({
              id: journal.id,
              date: journal.journalDate,
              amount: journal.totalAmount,
              currency: journal.currencyCode,
              accountId: leg.accountId,
              direction: leg.direction,
              planLinked: true,
              status: 'planned',
              structure,
            });
          }
        }

        const projected = projectPlannedOccurrencesForHorizon(
          toPlainPlannedPayment(payment),
          savedDays,
          { throughDate: projectThrough },
        );
        for (const item of projected) {
          const day = normalizeToStartOfDay(item.date);
          if (day > projectThrough) continue;
          const occurrenceId = `plan:${payment.id}:${day}`;
          if (seenOccurrenceIds.has(occurrenceId)) continue;
          seenOccurrenceIds.add(occurrenceId);
          occurrences.push({
            id: occurrenceId,
            planId: payment.id,
            status,
            date: day,
            intervalDays: days,
            amount: payment.amount,
            currency: payment.currencyCode,
            accountId: leg.accountId,
            toAccountId: leg.toAccountId,
            direction: leg.direction,
            fxMode,
            structure,
          });
        }
      }

      const [pendingSms, pendingEmail, nearbyCapture, referenceJournals] = await Promise.all([
        d.findPendingSms(workplaceId, PENDING_LIMIT),
        d.findPendingEmail(workplaceId, PENDING_LIMIT),
        d.findUnlinkedPostedNear(
          {
            centerDate: observation.date,
            windowMs: softMs + strictMs,
            amount: observation.amount,
          },
          workplaceId,
        ),
        observation.reference
          ? observation.direction === 'unknown'
            ? d.findReferenceCandidates({
                workplaceId,
                reference: observation.reference,
                amount: observation.amount,
                currencyCode: observation.currency,
              })
            : d.findReferenceMatches({
                workplaceId,
                reference: observation.reference,
                amount: observation.amount,
                currencyCode: observation.currency,
                accountId: (observation.visibleAccountId ?? observation.accountId) as AccountId,
                direction:
                  observation.direction === 'debit'
                    ? TransactionDirection.DEBIT
                    : TransactionDirection.CREDIT,
                receivedAt: observation.date,
              })
          : Promise.resolve([] as Journal[]),
      ]);

      const pendingObservations = [...pendingSms, ...pendingEmail]
        .map(toPendingObservation)
        .filter((item): item is MovementObservation => item != null && item.id !== observation.id)
        .filter(
          item => !item.currency || !observation.currency || item.currency === observation.currency,
        );

      const captureIds = nearbyCapture.map(journal => journal.id);
      const [captureTx, captureMeta, captureInbox] = await Promise.all([
        d.findTransactionsByJournals(workplaceId, captureIds),
        d.loadJournalMetadata(workplaceId, captureIds),
        d.findInboxLinkedToJournals(workplaceId, captureIds),
      ]);
      const captureMetaById = new Map(captureMeta.map(row => [row.journalId, row]));
      const captureInboxById = new Map(captureInbox.map(row => [row.journalId, row]));
      const obsAccount = observation.visibleAccountId ?? observation.accountId;
      const captureJournals: ExistingMovement[] = [];
      for (const journal of nearbyCapture) {
        const legs = captureTx.filter(
          tx => tx.journalId === journal.id && tx.accountId === obsAccount,
        );
        if (!legs.length) continue;
        const meta = captureMetaById.get(journal.id);
        // Prefer journals that look like capture (metadata or inbox link); still include amount matches.
        const inbox = captureInboxById.get(journal.id);
        const capture = meta ? readCaptureMetadata(meta.metadataJson) : null;
        if (!capture && !inbox) continue;
        const leg = legs[0];
        const direction: MovementObservation['direction'] =
          leg.transactionType === TransactionType.CREDIT ? 'debit' : 'credit';
        const original = readOriginalPlannedDate(journal, captureMetaById);
        captureJournals.push({
          id: journal.id,
          date: journal.journalDate,
          amount: journal.totalAmount,
          currency: journal.currencyCode,
          accountId: obsAccount,
          direction,
          reference: inbox?.reference ?? meta?.referenceNumber ?? null,
          channel: inbox?.channel ?? channelFromMetadata(meta),
          linked: Boolean(inbox),
          planLinked: false,
          status: 'posted',
          structure: capture?.economicKind ?? null,
          ...(original != null ? { originalPlannedDate: original } : {}),
        });
      }

      if (referenceJournals.length) {
        const refIds = referenceJournals.map(journal => journal.id);
        const [refMeta, refInbox, refTx] = await Promise.all([
          d.loadJournalMetadata(workplaceId, refIds),
          d.findInboxLinkedToJournals(workplaceId, refIds),
          d.findTransactionsByJournals(workplaceId, refIds),
        ]);
        const refMetaById = new Map(refMeta.map(row => [row.journalId, row]));
        const refInboxById = new Map(refInbox.map(row => [row.journalId, row]));
        for (const journal of referenceJournals) {
          const meta = refMetaById.get(journal.id);
          const inbox = refInboxById.get(journal.id);
          const leg =
            refTx.find(tx => tx.journalId === journal.id && tx.accountId === obsAccount) ??
            refTx.find(tx => tx.journalId === journal.id);
          const direction: MovementObservation['direction'] = leg
            ? leg.transactionType === TransactionType.CREDIT
              ? 'debit'
              : 'credit'
            : observation.direction;
          const original = readOriginalPlannedDate(journal, refMetaById);
          pushJournal({
            id: journal.id,
            date: journal.journalDate,
            amount: journal.totalAmount,
            currency: journal.currencyCode,
            accountId: (leg?.accountId as string) ?? obsAccount,
            direction,
            reference: inbox?.reference ?? meta?.referenceNumber ?? observation.reference ?? null,
            channel: inbox?.channel ?? channelFromMetadata(meta),
            linked: Boolean(inbox),
            planLinked: Boolean(journal.plannedPaymentId),
            status: journal.status === JournalStatus.PLANNED ? 'planned' : 'posted',
            structure: readCaptureMetadata(meta?.metadataJson)?.economicKind ?? null,
            ...(original != null ? { originalPlannedDate: original } : {}),
          });
        }
      }

      return {
        occurrences,
        pendingObservations,
        captureJournals,
        journals,
        today,
      };
    },
  };
}

/**
 * Loads repository facts then runs the pure domain matcher.
 * Re-validate inside `runAccountingWriteSession` before writing (spec Concurrency).
 */
export async function findSharedMovementMatch(
  observation: MovementObservation,
  loader: SharedMovementMatchLoader,
): Promise<MovementMatchResult> {
  return matchSharedMovement({ ...(await loader.loadFacts(observation)), observation });
}
