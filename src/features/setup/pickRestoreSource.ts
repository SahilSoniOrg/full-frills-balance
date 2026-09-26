import {
  decodeContent,
  extractIfZip,
  importRegistry,
  readFileAsBytes,
  sanitizeContent,
} from '@/src/services/import';
import { prepareRestore, type PreparedRestore } from '@/src/services/import/restore';
import type { ImportFileContext, ImportPlugin } from '@/src/services/import/types';
import { restoreSources, type RestoreSetupDraft, type RestoreSourceOutput } from './setupTypes';
import * as DocumentPicker from 'expo-document-picker';
import { generator } from '@/src/data/database/idGenerator';
import type { WorkplaceId } from '@/src/types/ids';
import { InboxProcessingStatus } from '@/src/types/enums';
import type { CanonicalJournal, CanonicalTransaction } from '@/src/types/importContracts';
import type { TransactionType } from '@/src/types/enums';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { toTransactionType } from '@/src/data/repositories/importValueParsers';
import {
  evaluateJournalBalance,
  proposeUniqueJournalFxRate,
  resolveCurrencyPrecisions,
} from '@/src/domain/accounting/journalBalanceEvaluator';
import type {
  PostedJournalFxProposal,
  PostedJournalImportIssue,
} from '@/src/domain/accounting/PostedJournalImportError';
import type { JournalBalanceEvaluation } from '@/src/domain/accounting/journalBalanceEvaluator';
import { fromMinorUnits, toMinorUnits } from '@/src/utils/money';
import { formatDate } from '@/src/utils/dateUtils';

const preparedByFingerprint = new Map<string, PreparedRestore>();
const preparedByOperationId = new Map<string, PreparedRestore>();
const preparedByWorkplaceIndex = new Map<string, PreparedRestore>();

function indexedSourceKey(fingerprint: string, workplaceIndex: number): string {
  return `${fingerprint}:${workplaceIndex}`;
}

export function rememberPreparedRestore(
  prepared: PreparedRestore,
  operationId?: WorkplaceId,
  workplaceIndex?: number,
): void {
  if (operationId) preparedByOperationId.set(operationId, prepared);
  else if (workplaceIndex !== undefined) {
    preparedByWorkplaceIndex.set(indexedSourceKey(prepared.fingerprint, workplaceIndex), prepared);
  } else preparedByFingerprint.set(prepared.fingerprint, prepared);
}

export function forgetAllPreparedRestores(): void {
  preparedByFingerprint.clear();
  preparedByOperationId.clear();
  preparedByWorkplaceIndex.clear();
}

export function keepPreparedRestores(sources: readonly RestoreSourceOutput[]): void {
  const fingerprints = new Set(
    sources.filter(source => !source.operationId).map(source => source.source.fingerprint),
  );
  const operationIds = new Set<string>(
    sources.flatMap(source => (source.operationId ? [source.operationId] : [])),
  );
  const indexedSources = new Set(
    sources.flatMap(source =>
      !source.operationId && source.source.workplaceIndex !== undefined
        ? [indexedSourceKey(source.source.fingerprint, source.source.workplaceIndex)]
        : [],
    ),
  );
  for (const fingerprint of preparedByFingerprint.keys()) {
    if (!fingerprints.has(fingerprint)) preparedByFingerprint.delete(fingerprint);
  }
  for (const operationId of preparedByOperationId.keys()) {
    if (!operationIds.has(operationId)) preparedByOperationId.delete(operationId);
  }
  for (const key of preparedByWorkplaceIndex.keys()) {
    if (!indexedSources.has(key)) preparedByWorkplaceIndex.delete(key);
  }
}

/** Detected format must match the plugin the user selected. */
export function resolveRestorePlugin(
  context: ImportFileContext,
  expectedPluginId: string,
): ImportPlugin {
  const detected = importRegistry.detect(context);
  if (!detected) throw new Error('Could not determine restore file format');
  if (detected.id !== expectedPluginId) {
    throw new Error('Selected restore format does not match this backup');
  }
  return detected;
}

export interface V2Backup {
  format?: unknown;
  formatVersion?: unknown;
  preferences?: unknown;
  workplaces?: {
    workplace?: unknown;
    workplacePreferences?: unknown;
    data?: Record<string, unknown>;
  }[];
}

export function isV2Backup(value: unknown): value is V2Backup {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as V2Backup).format === 'full-frills-backup' &&
    (value as V2Backup).formatVersion === 2 &&
    Array.isArray((value as V2Backup).workplaces)
  );
}

export function normalizeV2Workplace(
  context: ImportFileContext,
  entry: NonNullable<V2Backup['workplaces']>[number],
): ImportFileContext {
  if (!entry.data || typeof entry.workplace !== 'object' || entry.workplace === null) {
    throw new Error('Selected workplace data is invalid');
  }
  const normalized = {
    ...(entry.data as Record<string, unknown>),
    version: '2.0',
    preferences: context.json && isV2Backup(context.json) ? context.json.preferences : undefined,
    workplacePreferences: entry.workplacePreferences,
    workplace: entry.workplace,
  };
  return { ...context, json: normalized, text: JSON.stringify(normalized) };
}

function sourceRefFor(
  file: DocumentPicker.DocumentPickerAsset,
  fingerprint: string,
  workplaceIndex?: number,
) {
  return {
    uri: file.uri,
    name: file.name,
    ...(file.size === undefined ? {} : { size: file.size }),
    fingerprint,
    ...(workplaceIndex === undefined ? {} : { workplaceIndex }),
  };
}

export async function pickAndPrepareRestore(
  expectedPluginId: string,
  onProgress?: (message: string, progress?: number) => void,
): Promise<readonly RestoreSourceOutput[] | 'cancelled'> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/json',
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream',
      '*/*',
    ],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return 'cancelled';
  forgetAllPreparedRestores();
  const file = result.assets[0];
  const context = await fileContext(file.uri, file.name);
  const v2 = isV2Backup(context.json) ? (context.json.workplaces ?? []) : undefined;
  if (v2?.length === 0) throw new Error('This backup contains no workplaces');
  const entries = v2 ?? [undefined];
  const preparedSources: RestoreSourceOutput[] = [];
  const preparationErrors: { index: number; error: unknown }[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    try {
      const selectedContext = entries[index]
        ? normalizeV2Workplace(context, entries[index]!)
        : context;
      const plugin = resolveRestorePlugin(selectedContext, expectedPluginId);
      const prepared = await prepareRestore(plugin, selectedContext, {
        onProgress: (message, progress) =>
          onProgress?.(
            entries.length > 1 ? `${message} (${index + 1}/${entries.length})` : message,
            progress === undefined ? undefined : (index + progress) / entries.length,
          ),
      });
      const operationId = preparedSources.length === 0 ? undefined : (generator() as WorkplaceId);
      rememberPreparedRestore(prepared, operationId, entries[index] ? index : undefined);
      preparedSources.push({
        source: sourceRefFor(file, prepared.fingerprint, entries[index] ? index : undefined),
        facts: prepared.facts,
        stats: prepared.stats,
        warnings: prepared.warnings,
        ...(operationId ? { operationId } : {}),
      });
    } catch (error) {
      // A malformed workplace should be discardable while retaining valid books
      // from the same V2 backup. Keep processing the remaining entries.
      preparationErrors.push({ index, error });
    }
  }
  if (preparedSources.length === 0) {
    const firstError = preparationErrors[0]?.error;
    throw firstError instanceof Error
      ? firstError
      : new Error('No workplaces in this backup could be restored');
  }
  if (preparationErrors.length > 0) {
    const skipped = preparationErrors.map(item => `Workplace ${item.index + 1}`).join(', ');
    preparedSources[0] = {
      ...preparedSources[0],
      warnings: [
        ...(preparedSources[0]?.warnings ?? []),
        `Could not prepare ${skipped}; those workplaces were discarded.`,
      ],
    };
  }
  return preparedSources;
}

/** Keep only the candidates the user chose after validation. */
export function selectPreparedRestoreSources(
  sources: readonly RestoreSourceOutput[],
  selectedIndexes: readonly number[],
): RestoreSourceOutput[] | undefined {
  const selectedSet = new Set(selectedIndexes);
  const selected = sources.filter((_, index) => selectedSet.has(index));
  return selected.length > 0 ? selected : undefined;
}

export async function loadPreparedRestores(draft: RestoreSetupDraft): Promise<PreparedRestore[]> {
  const sources = restoreSources(draft);
  const prepared: PreparedRestore[] = [];
  for (const source of sources) {
    // A v2 file has one raw fingerprint but multiple workplace payloads. Only the
    // single-workplace path can safely use the fingerprint cache directly.
    const cached = source.operationId
      ? preparedByOperationId.get(source.operationId)
      : source.source.workplaceIndex === undefined
        ? preparedByFingerprint.get(source.source.fingerprint)
        : preparedByWorkplaceIndex.get(
            indexedSourceKey(source.source.fingerprint, source.source.workplaceIndex),
          );
    if (cached) {
      prepared.push(cached);
      continue;
    }
    const context = await fileContext(source.source.uri, source.source.name);
    const selectedContext = await selectV2WorkplaceAtIndex(context, source.source.workplaceIndex);
    const plugin = importRegistry.detect(selectedContext);
    if (!plugin) throw new Error('Could not determine restore file format');
    const item = await prepareRestore(plugin, selectedContext);
    rememberPreparedRestore(item, source.operationId, source.source.workplaceIndex);
    prepared.push(item);
  }
  return prepared;
}

export interface PreparedRestoreJournalView {
  readonly journal: CanonicalJournal;
  readonly precisionByCurrency: ReadonlyMap<string, number>;
  readonly fxProposal?: PostedJournalFxProposal;
  readonly lines: readonly {
    readonly transaction: CanonicalTransaction;
    readonly accountName?: string;
    readonly accountCurrency?: string;
    readonly transactionType: TransactionType;
    readonly proposedExchangeRate?: number;
  }[];
}

export interface PreparedRestoreJournalIssueView extends PreparedRestoreJournalView {
  readonly details: string;
  readonly evaluation: JournalBalanceEvaluation;
}

async function precisionByCurrencyForJournal(
  canonicalData: PreparedRestore['canonicalData'],
  journal: CanonicalJournal,
  lines: readonly { transaction: CanonicalTransaction; accountCurrency?: string }[],
): Promise<Map<string, number>> {
  const activeImportedPrecisions = new Map(
    (canonicalData.currencies ?? [])
      .filter(currency => currency.deletedAt == null)
      .map(currency => [currency.code.trim().toUpperCase(), currency.precision]),
  );
  return resolveCurrencyPrecisions(
    [
      journal.currencyCode,
      ...lines.map(line => line.accountCurrency ?? line.transaction.currencyCode),
    ],
    code => activeImportedPrecisions.get(code) ?? currencyRepository.getPrecision(code),
  );
}

function sourceIndexForWorkplace(draft: RestoreSetupDraft, workplaceId: WorkplaceId): number {
  return restoreSources(draft).findIndex(
    (source, index) =>
      source.operationId === workplaceId ||
      (index === 0 && !source.operationId && draft.operationId === workplaceId),
  );
}

export function getPreparedRestoreWorkplaceName(
  draft: RestoreSetupDraft,
  workplaceId: WorkplaceId,
): string | undefined {
  const source = restoreSources(draft)[sourceIndexForWorkplace(draft, workplaceId)];
  return source?.facts.workplace.name?.trim() || undefined;
}

async function preparedRestoreAt(
  draft: RestoreSetupDraft,
  workplaceId: WorkplaceId,
): Promise<{ index: number; prepared: PreparedRestore } | undefined> {
  const index = sourceIndexForWorkplace(draft, workplaceId);
  if (index < 0) return undefined;
  const prepared = (await loadPreparedRestores(draft))[index];
  return prepared ? { index, prepared } : undefined;
}

function rememberRestoreAt(
  draft: RestoreSetupDraft,
  index: number,
  prepared: PreparedRestore,
): void {
  const source = restoreSources(draft)[index];
  rememberPreparedRestore(prepared, source?.operationId, source?.source.workplaceIndex);
}

async function preparedRestoreJournalView(
  canonicalData: PreparedRestore['canonicalData'],
  journalId: string,
  fxProposal?: PostedJournalFxProposal,
): Promise<PreparedRestoreJournalView | undefined> {
  const journal = canonicalData.journals.find(candidate => candidate.id === journalId);
  if (!journal) return undefined;
  const accounts = new Map(
    canonicalData.accounts.map(account => [
      account.id,
      {
        name: account.name,
        currencyCode: account.deletedAt ? undefined : account.currencyCode,
      },
    ]),
  );
  const transactions = canonicalData.transactions.filter(
    transaction => transaction.journalId === journalId && !transaction.deletedAt,
  );
  const lines = transactions.map(transaction => ({
    transaction,
    accountName: accounts.get(transaction.accountId)?.name,
    accountCurrency: accounts.get(transaction.accountId)?.currencyCode,
    transactionType: toTransactionType(transaction.transactionType),
    proposedExchangeRate:
      fxProposal?.transactionId === transaction.id ? fxProposal.exchangeRate : undefined,
  }));
  const precisionByCurrency = await precisionByCurrencyForJournal(canonicalData, journal, lines);
  return {
    journal,
    precisionByCurrency,
    ...(fxProposal ? { fxProposal } : {}),
    lines,
  };
}

/** Read all rejected entries from the same prepared Workplace in one pass. */
export async function getPreparedRestoreJournalIssues(
  draft: RestoreSetupDraft,
  workplaceId: WorkplaceId,
  issues: readonly PostedJournalImportIssue[],
): Promise<PreparedRestoreJournalIssueView[]> {
  const item = await preparedRestoreAt(draft, workplaceId);
  if (!item) return [];
  const views = await Promise.all(
    issues.map(async issue => {
      const entry = await preparedRestoreJournalView(
        item.prepared.canonicalData,
        issue.journalId,
        issue.fxProposal,
      );
      return entry ? { ...entry, details: issue.details, evaluation: issue.evaluation } : undefined;
    }),
  );
  return views.filter((view): view is PreparedRestoreJournalIssueView => view !== undefined);
}

export interface RestoreJournalLineEdit {
  readonly transactionId: string;
  readonly amount: string;
  readonly exchangeRate?: string;
}

/** Apply edits to the in-memory prepared backup so publication retries use the revised lines. */
export async function editPreparedRestoreJournal(
  draft: RestoreSetupDraft,
  workplaceId: WorkplaceId,
  journalId: string,
  edits: readonly RestoreJournalLineEdit[],
): Promise<string> {
  const item = await preparedRestoreAt(draft, workplaceId);
  if (!item)
    throw new Error('The prepared restore is no longer available. Select the backup again.');
  const { canonicalData } = item.prepared;
  const journal = canonicalData.journals.find(candidate => candidate.id === journalId);
  if (!journal) throw new Error('This journal entry is no longer available in the backup.');
  const lines = canonicalData.transactions.filter(
    transaction => transaction.journalId === journalId && !transaction.deletedAt,
  );
  const editsById = new Map(edits.map(edit => [edit.transactionId, edit]));
  if (editsById.size !== lines.length || lines.some(line => !editsById.has(line.id))) {
    throw new Error('Every posting line must have a valid edit.');
  }

  const accountCurrencyById = new Map(
    canonicalData.accounts.map(account => [
      account.id,
      account.deletedAt ? undefined : account.currencyCode,
    ]),
  );
  const transactions = canonicalData.transactions.map(transaction => {
    if (transaction.journalId !== journalId || transaction.deletedAt) return transaction;
    const edit = editsById.get(transaction.id);
    if (!edit || !edit.amount.trim()) throw new Error('Enter an amount for every posting line.');
    const amount = Number(edit.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Posting amounts must be greater than zero.');
    }
    const accountCurrency = accountCurrencyById.get(transaction.accountId);
    if (
      !accountCurrency ||
      accountCurrency.trim().toUpperCase() === journal.currencyCode.trim().toUpperCase()
    ) {
      return { ...transaction, amount };
    }
    const rate = edit.exchangeRate?.trim() ? Number(edit.exchangeRate) : Number.NaN;
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error('Exchange rates must be greater than zero.');
    }
    return { ...transaction, amount, exchangeRate: rate };
  });
  const updatedLines = transactions.filter(
    transaction => transaction.journalId === journalId && !transaction.deletedAt,
  );
  const precisionByCurrency = await precisionByCurrencyForJournal(
    canonicalData,
    journal,
    updatedLines.map(transaction => ({
      transaction,
      accountCurrency: accountCurrencyById.get(transaction.accountId),
    })),
  );
  const evaluation = evaluateJournalBalance({
    journalCurrency: journal.currencyCode,
    precisionByCurrency,
    lines: updatedLines.map(transaction => ({
      id: transaction.id,
      accountId: transaction.accountId,
      accountCurrency: accountCurrencyById.get(transaction.accountId),
      amount: transaction.amount,
      exchangeRate: transaction.exchangeRate,
      transactionType: toTransactionType(transaction.transactionType),
    })),
  });
  if (!evaluation.isBalanced) {
    const message = evaluation.issues.map(issue => issue.message).join('; ');
    throw new Error(message || 'Balance the journal before applying these changes.');
  }
  const normalizedAmounts = new Map(
    evaluation.lineValues.map(line => [line.id, line.nativeAmount]),
  );
  const normalizedTransactions = transactions.map(transaction => {
    const amount = normalizedAmounts.get(transaction.id);
    return amount === undefined ? transaction : { ...transaction, amount };
  });
  const accountNameById = new Map(
    canonicalData.accounts.map(account => [account.id, account.name]),
  );
  const changes = lines.flatMap(original => {
    const updated = normalizedTransactions.find(candidate => candidate.id === original.id);
    if (!updated) return [];
    const currency = accountCurrencyById.get(original.accountId) ?? original.currencyCode;
    const changesForLine: string[] = [];
    if (original.amount !== updated.amount) {
      changesForLine.push(`${original.amount} ${currency} → ${updated.amount} ${currency}`);
    }
    if (original.exchangeRate !== updated.exchangeRate) {
      changesForLine.push(
        `rate ${original.exchangeRate ?? 'missing'} → ${updated.exchangeRate ?? 'missing'} ${journal.currencyCode}`,
      );
    }
    return changesForLine.length > 0
      ? [
          `${accountNameById.get(original.accountId) ?? 'Posting line'}: ${changesForLine.join(', ')}`,
        ]
      : [];
  });
  const change = changes.length
    ? `Edited “${journal.description?.trim() || 'Imported journal entry'}” (${formatDate(journal.journalDate)}): ${changes.join('; ')}.`
    : `Reviewed “${journal.description?.trim() || 'Imported journal entry'}” (${formatDate(journal.journalDate)}); no amount or rate changes were needed.`;
  const totalMinorUnits =
    evaluation.journalTotalAmount !== undefined
      ? toMinorUnits(evaluation.journalTotalAmount, evaluation.journalPrecision)
      : Math.max(evaluation.debitTotalMinorUnits, evaluation.creditTotalMinorUnits);
  const journals = canonicalData.journals.map(candidate =>
    candidate.id === journalId
      ? {
          ...candidate,
          totalAmount: fromMinorUnits(totalMinorUnits, evaluation.journalPrecision),
        }
      : candidate,
  );

  rememberRestoreAt(draft, item.index, {
    ...item.prepared,
    canonicalData: { ...canonicalData, journals, transactions: normalizedTransactions },
    warnings: [...item.prepared.warnings, change],
  });
  return change;
}

export interface RestoreFxRepairResult {
  readonly changes: readonly string[];
}

/** Apply only uniquely inferred FX rates that preserve imported account amounts. */
export async function applyPreparedRestoreFxSuggestions(
  draft: RestoreSetupDraft,
  workplaceId: WorkplaceId,
  issues: readonly PostedJournalImportIssue[],
): Promise<RestoreFxRepairResult> {
  const item = await preparedRestoreAt(draft, workplaceId);
  if (!item)
    throw new Error('The prepared restore is no longer available. Select the backup again.');

  const { canonicalData } = item.prepared;
  const accountCurrencyById = new Map(
    canonicalData.accounts.map(account => [
      account.id,
      account.deletedAt ? undefined : account.currencyCode,
    ]),
  );
  let transactions = canonicalData.transactions;
  let journals = canonicalData.journals;
  const changes: string[] = [];

  for (const issue of issues) {
    const proposal = issue.fxProposal;
    if (!proposal?.evaluation.isBalanced) {
      throw new Error('This implied rate suggestion is not safe to apply automatically.');
    }
    const journal = journals.find(candidate => candidate.id === issue.journalId);
    if (!journal || journal.deletedAt) {
      throw new Error(
        'A journal in the restore changed before its suggested rate could be applied.',
      );
    }
    const activeLines = transactions.filter(
      transaction => transaction.journalId === journal.id && !transaction.deletedAt,
    );
    const precisionByCurrency = await precisionByCurrencyForJournal(
      canonicalData,
      journal,
      activeLines.map(transaction => ({
        transaction,
        accountCurrency: accountCurrencyById.get(transaction.accountId),
      })),
    );
    const input = {
      journalCurrency: journal.currencyCode,
      precisionByCurrency,
      lines: activeLines.map(transaction => ({
        id: transaction.id,
        accountId: transaction.accountId,
        accountCurrency: accountCurrencyById.get(transaction.accountId),
        amount: transaction.amount,
        exchangeRate: transaction.exchangeRate,
        transactionType: toTransactionType(transaction.transactionType),
      })),
    };
    const expected = proposeUniqueJournalFxRate(input);
    if (
      !expected ||
      expected.transactionId !== proposal.transactionId ||
      expected.exchangeRate !== proposal.exchangeRate
    ) {
      throw new Error('The implied rate suggestion no longer matches the journal amounts.');
    }

    const updatedTransactions = transactions.map(transaction =>
      transaction.id === expected.transactionId
        ? { ...transaction, exchangeRate: expected.exchangeRate }
        : transaction,
    );
    const evaluation = evaluateJournalBalance({
      ...input,
      lines: input.lines.map(line =>
        line.id === expected.transactionId
          ? { ...line, exchangeRate: expected.exchangeRate }
          : line,
      ),
    });
    if (!evaluation.isBalanced) {
      throw new Error('The implied rate no longer balances its journal.');
    }

    // Keep imported native amounts byte-for-byte; only the journal valuation changes.
    transactions = updatedTransactions;
    const totalMinorUnits = Math.max(
      evaluation.debitTotalMinorUnits,
      evaluation.creditTotalMinorUnits,
    );
    journals = journals.map(candidate =>
      candidate.id === journal.id
        ? {
            ...candidate,
            totalAmount: fromMinorUnits(totalMinorUnits, evaluation.journalPrecision),
          }
        : candidate,
    );

    const line = activeLines.find(candidate => candidate.id === expected.transactionId);
    const currency = line ? (accountCurrencyById.get(line.accountId) ?? line.currencyCode) : '';
    const description = journal.description?.trim() || 'Imported journal entry';
    const displayRate = Number(expected.exchangeRate.toPrecision(10)).toString();
    changes.push(
      `Adjusted FX for “${description}” (${formatDate(journal.journalDate)}): 1 ${currency} = ${displayRate} ${journal.currencyCode}. Account amounts were kept unchanged.`,
    );
  }

  if (issues.length === 0) {
    throw new Error('There are no uniquely balanceable FX suggestions to apply.');
  }
  rememberRestoreAt(draft, item.index, {
    ...item.prepared,
    canonicalData: { ...canonicalData, journals, transactions },
    warnings: [...item.prepared.warnings, ...changes],
  });
  return { changes };
}

/** Remove the rejected entry and dependent rows from the prepared backup before retrying. */
export async function ignorePreparedRestoreJournal(
  draft: RestoreSetupDraft,
  workplaceId: WorkplaceId,
  journalId: string,
): Promise<string> {
  const item = await preparedRestoreAt(draft, workplaceId);
  if (!item)
    throw new Error('The prepared restore is no longer available. Select the backup again.');
  const { canonicalData } = item.prepared;
  if (!canonicalData.journals.some(journal => journal.id === journalId)) {
    throw new Error('This journal entry is no longer available in the backup.');
  }

  const transactionIds = new Set(
    canonicalData.transactions
      .filter(transaction => transaction.journalId === journalId)
      .map(transaction => transaction.id),
  );
  const journal = canonicalData.journals.find(candidate => candidate.id === journalId);
  const journals = canonicalData.journals
    .filter(journal => journal.id !== journalId)
    .map(journal => ({
      ...journal,
      ...(journal.originalJournalId === journalId ? { originalJournalId: undefined } : {}),
      ...(journal.reversingJournalId === journalId ? { reversingJournalId: undefined } : {}),
    }));
  const canonicalDataWithoutJournal = {
    ...canonicalData,
    journals,
    transactions: canonicalData.transactions.filter(
      transaction => transaction.journalId !== journalId,
    ),
    journalMetadata: canonicalData.journalMetadata?.filter(
      metadata => metadata.journalId !== journalId,
    ),
    auditLogs: canonicalData.auditLogs?.filter(
      log =>
        !(log.entityType === 'journal' && log.entityId === journalId) &&
        !(log.entityType === 'transaction' && transactionIds.has(log.entityId)),
    ),
    balanceSnapshots: canonicalData.balanceSnapshots?.filter(
      snapshot => !transactionIds.has(snapshot.transactionId),
    ),
    transactionInboxRecords: canonicalData.transactionInboxRecords?.map(record => {
      const unlinked = record.linkedJournalId === journalId;
      const unmarkedDuplicate = record.duplicateJournalId === journalId;
      if (!unlinked && !unmarkedDuplicate) return record;
      return {
        ...record,
        ...(unlinked
          ? {
              linkedJournalId: undefined,
              processingStatus: InboxProcessingStatus.PENDING,
              processedAt: undefined,
            }
          : {}),
        ...(unmarkedDuplicate
          ? {
              duplicateJournalId: undefined,
              ...(record.processingStatus === InboxProcessingStatus.DUPLICATE_FLAGGED
                ? {
                    processingStatus: InboxProcessingStatus.PENDING,
                    processedAt: undefined,
                  }
                : {}),
            }
          : {}),
      };
    }),
  };

  const change = journal
    ? `Ignored “${journal.description?.trim() || 'a journal entry'}” (${formatDate(journal.journalDate)}) during restore.`
    : 'Ignored a journal entry during restore.';
  rememberRestoreAt(draft, item.index, {
    ...item.prepared,
    canonicalData: canonicalDataWithoutJournal,
    stats: {
      ...item.prepared.stats,
      journals: Math.max(0, item.prepared.stats.journals - 1),
      transactions: Math.max(0, item.prepared.stats.transactions - transactionIds.size),
    },
    warnings: [...item.prepared.warnings, change],
  });
  return change;
}

async function selectV2WorkplaceAtIndex(
  context: ImportFileContext,
  index?: number,
): Promise<ImportFileContext> {
  if (!isV2Backup(context.json)) return context;
  const workplaces = context.json.workplaces ?? [];
  if (index === undefined && workplaces.length > 1) {
    throw new Error('Restore selection must be restarted for this multi-workplace backup');
  }
  const entry = workplaces[index ?? 0];
  if (!entry) throw new Error('Selected workplace is missing from the backup');
  return normalizeV2Workplace(context, entry);
}

async function fileContext(uri: string, name: string): Promise<ImportFileContext> {
  let rawBytes = await readFileAsBytes(uri);
  rawBytes = await extractIfZip(rawBytes);
  const context: ImportFileContext = { uri, name, rawBytes };
  try {
    const text = sanitizeContent(decodeContent(rawBytes));
    context.text = text;
    try {
      context.json = JSON.parse(text);
    } catch {
      // Binary or non-JSON backups are still valid plugin inputs.
    }
  } catch {
    // Raw bytes are enough for plugins that do not need decoded text.
  }
  return context;
}
