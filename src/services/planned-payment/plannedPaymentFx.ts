import type PlannedPayment from '@/src/data/models/PlannedPayment';
import type Journal from '@/src/data/models/Journal';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { journalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { findJournalMetadataByJournalId } from '@/src/data/repositories/journal/JournalEnrichmentQueries';
import type { PlannedPaymentFxMode } from '@/src/types/plainDtos';
import { currencyReadService } from '@/src/services/currency-read-service';
import { resolveRequiredExchangeRate } from '@/src/services/currencyConversion';
import { requirePlannedPayment } from './plannedPaymentWorkplace';
import { normalizeToStartOfDay } from './plannedPaymentRecurrence';
import { normalizeCurrencyCode } from '@/src/domain/accounting/journalBalanceEvaluator';
import { normalizeCurrencyAmount } from '@/src/domain/accounting/journalFx';
import { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { TransactionType } from '@/src/types/enums';
import type { JournalWriteLine, JournalWriteMetadata } from '@/src/types/journalWrite';
import { safeParseJSON } from '@/src/utils/serialization';
import { AppConfig } from '@/src/constants';

export interface PlannedPaymentFxReview {
  sourceAmount: number;
  destinationAmount: number;
  fromAccountId: AccountId;
  toAccountId: AccountId;
  sourceCurrency: string;
  destinationCurrency: string;
  workplaceId: WorkplaceId;
  plannedPaymentId: PlannedPaymentId;
  occurrenceDate: number;
  planVersion: string;
  occurrenceVersion: string;
  journalId?: JournalId;
  planUpdatedAt?: number;
  journalUpdatedAt?: number;
}

const FX_METADATA_KEY = 'plannedPaymentFx';

export interface PlannedPaymentFxReviewRequest extends Omit<
  PlannedPaymentFxReview,
  'destinationAmount'
> {
  name: string;
  destinationAmount?: number;
}

export class PlannedPaymentFxReviewRequiredError extends Error {
  constructor(readonly request: Readonly<PlannedPaymentFxReviewRequest>) {
    super('Manual planned FX requires a reviewed occurrence');
    this.name = 'PlannedPaymentFxReviewRequiredError';
  }
}

export interface PlannedPaymentFxContext {
  mode: PlannedPaymentFxMode;
  name: string;
  review: PlannedPaymentFxReview;
  lines: JournalWriteLine[];
  metadata?: JournalWriteMetadata;
  fixedDestinationAmount?: number;
}

export interface PlannedPaymentFxQuote {
  sourceCurrency: string;
  destinationCurrency: string;
  rate: number | null;
}

export function plannedPaymentFxMode(payment: PlannedPayment): PlannedPaymentFxMode | undefined {
  const mode = payment.fxMode;
  if (mode != null && !['automatic', 'fixed', 'manual'].includes(mode)) {
    throw new Error('Invalid planned payment FX mode');
  }
  return mode ?? undefined;
}

/** An existing occurrence retains its generated FX policy when the recurring template changes. */
export async function readPlannedPaymentFxContext(
  payment: PlannedPayment,
  occurrenceDate: number,
  journal?: Journal,
): Promise<PlannedPaymentFxContext | undefined> {
  const storedMetadata = journal
    ? await findJournalMetadataByJournalId(journal.id, payment.workplaceId)
    : undefined;
  const metadataJson = safeParseJSON<Record<string, unknown>>(storedMetadata?.metadataJson, {});
  const snapshot = metadataJson[FX_METADATA_KEY];
  const policy =
    snapshot && typeof snapshot === 'object'
      ? (snapshot as {
          mode?: PlannedPaymentFxMode;
          destinationAmount?: number;
        })
      : undefined;
  const mode = journal ? policy?.mode : plannedPaymentFxMode(payment);
  if (!mode) return undefined;
  if (!['automatic', 'fixed', 'manual'].includes(mode))
    throw new Error('Invalid occurrence FX mode');
  const lines: JournalWriteLine[] = journal
    ? (await transactionQueryRepository.findByJournal(payment.workplaceId, journal.id)).map(
        line => ({
          accountId: line.accountId,
          amount: line.amount,
          transactionType: line.transactionType,
          notes: line.notes,
          currencyCode: line.currencyCode,
          exchangeRate: line.exchangeRate,
        }),
      )
    : [
        {
          accountId: payment.fromAccountId,
          amount: payment.amount,
          transactionType: TransactionType.CREDIT,
          notes: payment.description,
        },
        {
          accountId: payment.toAccountId,
          amount: payment.destinationAmount ?? payment.amount,
          transactionType: TransactionType.DEBIT,
          notes: payment.description,
        },
      ];
  const source = lines.find(line => line.transactionType === TransactionType.CREDIT);
  const destination = lines.find(line => line.transactionType === TransactionType.DEBIT);
  if (
    lines.length !== 2 ||
    !source ||
    !destination ||
    !source.accountId ||
    !destination.accountId ||
    source.accountId === destination.accountId
  ) {
    throw new Error(
      'Explicit planned FX requires exactly two distinct accounts and one debit/credit pair',
    );
  }
  const accounts = await accountQueryRepository.findAllByIds(payment.workplaceId, [
    source.accountId,
    destination.accountId,
  ]);
  const sourceCurrency = normalizeCurrencyCode(
    accounts.find(account => account.id === source.accountId)?.currencyCode,
  );
  const destinationCurrency = normalizeCurrencyCode(
    accounts.find(account => account.id === destination.accountId)?.currencyCode,
  );
  if (!sourceCurrency || !destinationCurrency)
    throw new Error('Planned FX accounts are missing or unavailable');
  if (!journal && normalizeCurrencyCode(payment.currencyCode) !== sourceCurrency) {
    throw new Error('Explicit planned payment currency must match the source account currency');
  }
  if (journal && normalizeCurrencyCode(journal.currencyCode) !== sourceCurrency) {
    throw new Error('Edited source account currency must match the saved planned journal currency');
  }
  const planVersion = JSON.stringify([
    payment.id,
    payment.fxMode ?? null,
    payment.amount,
    payment.destinationAmount ?? null,
    payment.currencyCode,
    payment.fromAccountId,
    payment.toAccountId,
    payment.updatedAt?.getTime(),
  ]);
  const occurrenceVersion = JSON.stringify([
    journal?.id ?? null,
    journal?.updatedAt?.getTime(),
    journal?.journalDate,
    mode,
    policy?.destinationAmount,
    ...lines.map(line => [
      line.accountId,
      line.amount,
      line.currencyCode,
      line.exchangeRate,
      line.transactionType,
      line.notes,
    ]),
  ]);
  return {
    mode,
    name: payment.name,
    lines,
    fixedDestinationAmount: journal
      ? destination.amount
      : (policy?.destinationAmount ?? payment.destinationAmount),
    metadata: storedMetadata
      ? {
          importSource: storedMetadata.importSource,
          originalSmsId: storedMetadata.originalSmsId,
          metadataJson: storedMetadata.metadataJson,
        }
      : undefined,
    review: {
      sourceAmount: source.amount,
      destinationAmount: destination.amount,
      fromAccountId: source.accountId,
      toAccountId: destination.accountId,
      sourceCurrency,
      destinationCurrency,
      workplaceId: payment.workplaceId,
      plannedPaymentId: payment.id,
      occurrenceDate: normalizeToStartOfDay(occurrenceDate),
      planVersion,
      occurrenceVersion,
      journalId: journal?.id,
      planUpdatedAt: payment.updatedAt?.getTime(),
      journalUpdatedAt: journal?.updatedAt?.getTime(),
    },
  };
}

export function plannedPaymentFxMetadata(
  context: PlannedPaymentFxContext,
  extra: Record<string, unknown> = {},
): JournalWriteMetadata {
  return {
    ...context.metadata,
    importSource: context.metadata?.importSource ?? 'planned_payment',
    metadataJson: JSON.stringify({
      ...safeParseJSON<Record<string, unknown>>(context.metadata?.metadataJson, {}),
      [FX_METADATA_KEY]: { mode: context.mode, destinationAmount: context.fixedDestinationAmount },
      ...extra,
    }),
  };
}

/** Prefetch outside accounting sessions: the rate service may write its own cache. */
export async function preparePlannedPaymentFxQuote(
  workplaceId: WorkplaceId,
  plannedPaymentId: PlannedPaymentId,
  occurrenceDate: number,
  action: {
    kind: 'generate' | 'post' | 'autoPostDue' | 'skip';
    postedAt?: number;
    asOf?: number;
    journalId?: JournalId;
  },
): Promise<PlannedPaymentFxQuote | undefined> {
  if (action.kind === 'skip') return undefined;
  const payment = await requirePlannedPayment(workplaceId, plannedPaymentId);
  if (!plannedPaymentFxMode(payment) && !action.journalId) return undefined;
  const start = normalizeToStartOfDay(occurrenceDate);
  let journal: Journal | undefined;
  if (action.journalId) {
    journal = (await journalQueryRepository.find(workplaceId, action.journalId)) ?? undefined;
    if (!journal || journal.plannedPaymentId !== plannedPaymentId) return undefined;
  } else {
    const occurrence = await journalPlannedQueries.findOccurrenceJournals(
      workplaceId,
      plannedPaymentId,
      start,
      start + AppConfig.time.msPerDay - 1,
    );
    journal = occurrence.kind === 'planned' ? occurrence.journals[0] : undefined;
  }
  const context = await readPlannedPaymentFxContext(payment, occurrenceDate, journal);
  if (
    !context ||
    context.mode === 'fixed' ||
    (context.mode === 'manual' &&
      (action.kind !== 'generate' ||
        context.fixedDestinationAmount !== undefined ||
        context.review.journalId !== undefined))
  )
    return undefined;
  const { sourceCurrency, destinationCurrency } = context.review;
  const spot = await resolveRequiredExchangeRate(sourceCurrency, destinationCurrency);
  return { sourceCurrency, destinationCurrency, rate: spot.ok ? spot.rate : null };
}

function assertPlannedPaymentFxReview(
  context: PlannedPaymentFxContext,
  review?: PlannedPaymentFxReview,
): asserts review is PlannedPaymentFxReview {
  if (!review)
    throw new PlannedPaymentFxReviewRequiredError({ ...context.review, name: context.name });
  const current = context.review;
  const identityKeys = [
    'workplaceId',
    'plannedPaymentId',
    'occurrenceDate',
    'planVersion',
    'occurrenceVersion',
    'journalId',
    'planUpdatedAt',
    'journalUpdatedAt',
    'fromAccountId',
    'toAccountId',
    'sourceCurrency',
    'destinationCurrency',
  ] as const;
  if (identityKeys.some(key => review[key] !== current[key])) {
    throw new Error('Planned FX review is stale; review this occurrence again');
  }
}

/** Produces native amounts. Only manual posting may replace the source amount. */
export async function resolvePlannedPaymentFxAmounts(
  context: PlannedPaymentFxContext,
  options: {
    posting: boolean;
    postedAt?: number;
    quote?: PlannedPaymentFxQuote;
    review?: PlannedPaymentFxReview;
  },
): Promise<{ sourceAmount: number; destinationAmount: number }> {
  const [sourcePrecision, destinationPrecision] = await Promise.all([
    currencyReadService.getPrecision(context.review.sourceCurrency),
    currencyReadService.getPrecision(context.review.destinationCurrency),
  ]);
  let sourceAmount = context.review.sourceAmount;
  let destinationAmount: number | undefined;
  if (
    context.review.sourceCurrency === context.review.destinationCurrency &&
    context.mode !== 'fixed'
  ) {
    destinationAmount = sourceAmount;
  } else if (context.mode === 'manual' && options.posting) {
    assertPlannedPaymentFxReview(context, options.review);
    sourceAmount = options.review.sourceAmount;
    destinationAmount = options.review.destinationAmount;
  } else if (
    context.mode === 'fixed' ||
    (context.mode === 'manual' &&
      (context.review.journalId || context.fixedDestinationAmount !== undefined))
  ) {
    destinationAmount = context.fixedDestinationAmount ?? context.review.destinationAmount;
  } else {
    const quote = options.quote;
    if (
      quote &&
      (quote.sourceCurrency !== context.review.sourceCurrency ||
        quote.destinationCurrency !== context.review.destinationCurrency)
    ) {
      throw new Error('Planned FX currency pair changed; retry posting');
    }
    if (quote?.rate != null) destinationAmount = sourceAmount * quote.rate;
    else if (options.posting)
      throw new Error('Planned payment FX rate unavailable; occurrence remains pending');
    else
      destinationAmount = Math.max(context.review.destinationAmount, 10 ** -destinationPrecision);
  }
  if (
    context.review.sourceCurrency === context.review.destinationCurrency &&
    destinationAmount !== sourceAmount
  ) {
    throw new Error('Same-currency planned payment amounts must be equal');
  }
  const source = normalizeCurrencyAmount(sourceAmount, sourcePrecision);
  const destination = normalizeCurrencyAmount(
    destinationAmount ?? Number.NaN,
    destinationPrecision,
  );
  if (
    !Number.isFinite(sourceAmount) ||
    sourceAmount <= 0 ||
    !Number.isSafeInteger(source.minorUnits) ||
    source.amount <= 0 ||
    !Number.isFinite(destinationAmount) ||
    destinationAmount! <= 0 ||
    !Number.isSafeInteger(destination.minorUnits) ||
    destination.amount <= 0
  ) {
    throw new Error('Planned FX amounts must be positive and within the supported currency range');
  }
  // Fixed/reviewed amounts are exact native amounts, not quietly rounded user input.
  if (
    (context.mode === 'fixed' || (context.mode === 'manual' && options.posting)) &&
    destination.amount !== destinationAmount
  )
    throw new Error('Destination amount exceeds currency precision');
  if (source.amount !== sourceAmount) throw new Error('Source amount exceeds currency precision');
  return { sourceAmount: source.amount, destinationAmount: destination.amount };
}
