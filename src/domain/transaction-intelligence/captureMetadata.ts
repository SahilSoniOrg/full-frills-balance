import { AccountType, TransactionType } from '@/src/types/enums';
import { asAccountId, type AccountId } from '@/src/types/ids';
import { safeParseJSON } from '@/src/utils/serialization';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';

export interface CaptureSourceObservation {
  channel: 'sms' | 'voice' | 'email';
  sourceId: string;
  occurredAt: number;
  fingerprint?: string;
  merchant?: string;
  authentication?: 'dkim';
}

/** Category allocations only. Transaction IDs change when the editor replaces lines. */
export interface CaptureAllocation {
  accountId: AccountId;
  amount: number;
  transactionType: TransactionType;
  currencyCode?: string;
  origin: 'uncategorized' | 'user' | 'system' | 'default';
  confirmedAt?: number;
}

export interface CaptureMetadata {
  version: 1;
  merchant?: string;
  economicKind: 'expense' | 'income' | 'transfer';
  reviewState: 'needs_categorization' | 'confirmed' | 'defaulted' | 'not_applicable';
  allocations: CaptureAllocation[];
  sources: CaptureSourceObservation[];
  uncategorizedAccountIds?: AccountId[];
}

export interface CaptureCategoryLine {
  accountId: AccountId;
  amount: number;
  transactionType: TransactionType;
  currencyCode?: string;
  accountType: AccountType;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readObject(json: string | undefined): Record<string, unknown> {
  const parsed = json ? safeParseJSON<unknown>(json, null) : null;
  return isRecord(parsed) ? parsed : {};
}

function readAllocation(value: unknown): CaptureAllocation | null {
  if (
    !isRecord(value) ||
    typeof value.accountId !== 'string' ||
    !value.accountId ||
    typeof value.amount !== 'number' ||
    !Number.isFinite(value.amount) ||
    value.amount <= 0 ||
    (value.transactionType !== TransactionType.DEBIT &&
      value.transactionType !== TransactionType.CREDIT) ||
    (value.origin !== 'uncategorized' &&
      value.origin !== 'user' &&
      value.origin !== 'system' &&
      value.origin !== 'default') ||
    (value.currencyCode !== undefined && typeof value.currencyCode !== 'string') ||
    (value.confirmedAt !== undefined &&
      (typeof value.confirmedAt !== 'number' || !Number.isFinite(value.confirmedAt)))
  ) {
    return null;
  }
  return {
    accountId: asAccountId(value.accountId),
    amount: value.amount,
    transactionType: value.transactionType,
    currencyCode: value.currencyCode,
    origin: value.origin,
    confirmedAt: value.confirmedAt,
  };
}

function readSource(value: unknown): CaptureSourceObservation | null {
  if (
    !isRecord(value) ||
    (value.channel !== 'sms' && value.channel !== 'voice' && value.channel !== 'email') ||
    typeof value.sourceId !== 'string' ||
    !value.sourceId ||
    typeof value.occurredAt !== 'number' ||
    !Number.isFinite(value.occurredAt) ||
    (value.fingerprint !== undefined && typeof value.fingerprint !== 'string') ||
    (value.merchant !== undefined && typeof value.merchant !== 'string') ||
    (value.authentication !== undefined && value.authentication !== 'dkim')
  ) {
    return null;
  }
  return {
    channel: value.channel,
    sourceId: value.sourceId,
    occurredAt: value.occurredAt,
    fingerprint: value.fingerprint ? hashLegacySmsFingerprint(value.fingerprint) : undefined,
    merchant: value.merchant,
    authentication: value.authentication,
  };
}

/** Invalid/legacy metadata supplies no user confirmation. */
export function readCaptureMetadata(json: string | undefined): CaptureMetadata | null {
  const value = readObject(json).transactionCapture;
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    (value.economicKind !== 'expense' &&
      value.economicKind !== 'income' &&
      value.economicKind !== 'transfer') ||
    (value.reviewState !== 'needs_categorization' &&
      value.reviewState !== 'confirmed' &&
      value.reviewState !== 'defaulted' &&
      value.reviewState !== 'not_applicable') ||
    (value.merchant !== undefined && typeof value.merchant !== 'string') ||
    !Array.isArray(value.allocations) ||
    !Array.isArray(value.sources) ||
    (value.uncategorizedAccountIds !== undefined &&
      (!Array.isArray(value.uncategorizedAccountIds) ||
        value.uncategorizedAccountIds.some(id => typeof id !== 'string' || !id)))
  ) {
    return null;
  }
  const allocations = value.allocations.map(readAllocation);
  const sources = value.sources.map(readSource);
  if (allocations.some(allocation => !allocation) || sources.some(source => !source)) return null;
  return {
    version: 1,
    merchant: value.merchant,
    economicKind: value.economicKind,
    // Derive review from the labels: a stored summary alone is not confirmation.
    reviewState: reviewStateFor(
      allocations.filter(allocation => allocation !== null),
      value.economicKind,
    ),
    allocations: allocations.filter(allocation => allocation !== null),
    sources: sources.filter(source => source !== null),
    uncategorizedAccountIds: Array.isArray(value.uncategorizedAccountIds)
      ? value.uncategorizedAccountIds.map(id => asAccountId(String(id)))
      : undefined,
  };
}

export function reviewStateFor(
  allocations: readonly CaptureAllocation[],
  economicKind: CaptureMetadata['economicKind'],
): CaptureMetadata['reviewState'] {
  if (allocations.length === 0)
    return economicKind === 'transfer' ? 'not_applicable' : 'needs_categorization';
  if (
    allocations.every(
      allocation => allocation.origin === 'user' && allocation.confirmedAt !== undefined,
    )
  )
    return 'confirmed';
  if (
    allocations.every(
      allocation =>
        allocation.origin === 'default' ||
        (allocation.origin === 'user' && allocation.confirmedAt !== undefined),
    )
  )
    return 'defaulted';
  // Plan-driven system resolutions close review without becoming user learning labels.
  if (
    allocations.every(
      allocation => allocation.origin === 'system' && allocation.confirmedAt !== undefined,
    )
  )
    return 'confirmed';
  return 'needs_categorization';
}

/** Snapshot of the allocations a user was shown before explicitly confirming them. */
export function captureConfirmationKey(
  allocations: readonly CaptureAllocation[],
  lines: readonly Pick<
    CaptureCategoryLine,
    'accountId' | 'amount' | 'transactionType' | 'currencyCode'
  >[],
): string {
  return JSON.stringify([
    allocations
      .map(allocation =>
        JSON.stringify([
          allocation.accountId,
          allocation.amount,
          allocation.transactionType,
          allocation.currencyCode ?? null,
          allocation.origin,
          allocation.confirmedAt ?? null,
        ]),
      )
      .sort(),
    lines
      .map(line =>
        JSON.stringify([
          line.accountId,
          line.amount,
          line.transactionType,
          line.currencyCode ?? null,
        ]),
      )
      .sort(),
  ]);
}

/** Every saved category allocation must correspond to one current journal line. */
export function captureAllocationsMatchLines(
  allocations: readonly CaptureAllocation[],
  lines: readonly Pick<
    CaptureCategoryLine,
    'accountId' | 'amount' | 'transactionType' | 'currencyCode'
  >[],
): boolean {
  if (allocations.length !== lines.length) return false;
  const remaining = [...lines];
  for (const allocation of allocations) {
    const index = remaining.findIndex(
      line =>
        line.accountId === allocation.accountId &&
        line.amount === allocation.amount &&
        line.transactionType === allocation.transactionType &&
        (!allocation.currencyCode || allocation.currencyCode === line.currencyCode),
    );
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return true;
}

export function withCaptureMetadata(json: string | undefined, capture: CaptureMetadata): string {
  return JSON.stringify({
    ...readObject(json),
    transactionCapture: {
      ...capture,
      sources: mergeCaptureSources([], capture.sources),
      reviewState: reviewStateFor(capture.allocations, capture.economicKind),
    },
  });
}

export function withoutCaptureMetadata(json: string | undefined): string {
  const metadata = readObject(json);
  delete metadata.transactionCapture;
  return JSON.stringify(metadata);
}

export function mergeCaptureSources(
  sources: readonly CaptureSourceObservation[],
  incoming: readonly CaptureSourceObservation[],
): CaptureSourceObservation[] {
  const merged = new Map<string, CaptureSourceObservation>();
  for (const source of [...sources, ...incoming]) {
    const normalized = {
      ...source,
      fingerprint: source.fingerprint ? hashLegacySmsFingerprint(source.fingerprint) : undefined,
    };
    const key = JSON.stringify([normalized.channel, normalized.sourceId, normalized.fingerprint]);
    if (!merged.has(key)) merged.set(key, normalized);
  }
  return [...merged.values()];
}

/** Applies accumulated source observations without changing classification evidence. */
export function withCaptureSources(
  json: string | undefined,
  sources: readonly CaptureSourceObservation[],
): string | undefined {
  if (sources.length === 0) return json;
  const capture = readCaptureMetadata(json);
  if (!capture) return json;
  return withCaptureMetadata(json, {
    ...capture,
    merchant: capture.merchant ?? sources.find(source => source.merchant)?.merchant,
    sources: mergeCaptureSources(capture.sources, sources),
  });
}

/** Linking another observation cannot overwrite an existing classification or merchant. */
export function mergeCaptureMetadataJson(
  currentJson: string | undefined,
  incomingJson: string | undefined,
): string | undefined {
  if (!currentJson && !incomingJson) return undefined;
  const metadata = { ...readObject(currentJson), ...readObject(incomingJson) };
  const current = readCaptureMetadata(currentJson);
  const incoming = readCaptureMetadata(incomingJson);
  if (current) {
    metadata.transactionCapture = {
      ...current,
      sources: mergeCaptureSources(current.sources, incoming?.sources ?? []),
    };
  }
  return JSON.stringify(metadata);
}

export function preservedMerchants(json: string | undefined): string[] {
  const metadata = readObject(json);
  const capture = readCaptureMetadata(json);
  return [
    ...new Set(
      [
        capture?.merchant,
        ...(capture?.sources.map(source => source.merchant) ?? []),
        typeof metadata.parsedMerchant === 'string' ? metadata.parsedMerchant : undefined,
      ].filter((merchant): merchant is string => Boolean(merchant?.trim())),
    ),
  ];
}

/** User category choices affect their allocations; amount/description edits alone do not confirm. */
export function updateCaptureAllocations(
  capture: CaptureMetadata,
  lines: readonly CaptureCategoryLine[],
  userInitiated: boolean,
  now: number,
): CaptureMetadata {
  const uncategorized = new Set([
    ...(capture.uncategorizedAccountIds ?? []),
    ...capture.allocations
      .filter(allocation => allocation.origin === 'uncategorized')
      .map(allocation => allocation.accountId),
  ]);
  const categoryLines = lines.filter(
    line => line.accountType === AccountType.EXPENSE || line.accountType === AccountType.INCOME,
  );
  const remaining = [...capture.allocations];
  const allocations = categoryLines.map(line => {
    const sameCategory = (allocation: CaptureAllocation) =>
      allocation.accountId === line.accountId &&
      allocation.transactionType === line.transactionType &&
      (!allocation.currencyCode || allocation.currencyCode === line.currencyCode);
    const exactIndex = remaining.findIndex(
      allocation => sameCategory(allocation) && allocation.amount === line.amount,
    );
    const previousIndex = exactIndex >= 0 ? exactIndex : remaining.findIndex(sameCategory);
    const previous = previousIndex >= 0 ? remaining.splice(previousIndex, 1)[0] : undefined;
    const origin = uncategorized.has(line.accountId)
      ? 'uncategorized'
      : (previous?.origin ?? (userInitiated ? 'user' : 'system'));
    return {
      accountId: line.accountId,
      amount: line.amount,
      transactionType: line.transactionType,
      currencyCode: line.currencyCode,
      origin,
      confirmedAt: origin === 'user' ? (previous?.confirmedAt ?? now) : undefined,
    } satisfies CaptureAllocation;
  });
  const categoryTypes = new Set(categoryLines.map(line => line.accountType));
  const economicKind =
    categoryTypes.size === 0
      ? 'transfer'
      : categoryTypes.size === 1
        ? categoryTypes.has(AccountType.INCOME)
          ? 'income'
          : 'expense'
        : capture.economicKind;
  return {
    ...capture,
    economicKind,
    allocations,
    uncategorizedAccountIds: [...uncategorized],
    reviewState: reviewStateFor(allocations, economicKind),
  };
}

/** Account identity retargeting is not a new user category confirmation. */
export function retargetCaptureAccounts(
  capture: CaptureMetadata,
  accountIdFor: (accountId: AccountId) => AccountId,
): CaptureMetadata {
  const uncategorizedAccountIds = capture.uncategorizedAccountIds?.map(accountIdFor);
  const uncategorized = new Set(uncategorizedAccountIds ?? []);
  const allocations = capture.allocations.map(allocation => {
    const accountId = accountIdFor(allocation.accountId);
    return uncategorized.has(accountId)
      ? { ...allocation, accountId, origin: 'uncategorized' as const, confirmedAt: undefined }
      : { ...allocation, accountId };
  });
  return {
    ...capture,
    allocations,
    uncategorizedAccountIds,
    reviewState: reviewStateFor(allocations, capture.economicKind),
  };
}

/** A journal merge combines evidence without turning that action into a classification. */
export function combineCaptureMetadata(
  captures: readonly CaptureMetadata[],
): CaptureMetadata | null {
  const first = captures[0];
  if (!first) return null;
  const merchants = [...new Set(captures.map(capture => capture.merchant).filter(Boolean))];
  const allocations = captures.flatMap(capture => capture.allocations);
  return {
    ...first,
    merchant: merchants.length === 1 ? merchants[0] : undefined,
    allocations,
    sources: captures.reduce<CaptureSourceObservation[]>(
      (sources, capture) =>
        mergeCaptureSources(
          sources,
          capture.sources.map(source => ({
            ...source,
            merchant: source.merchant ?? capture.merchant,
          })),
        ),
      [],
    ),
    uncategorizedAccountIds: [
      ...new Set(captures.flatMap(capture => capture.uncategorizedAccountIds ?? [])),
    ],
    reviewState: reviewStateFor(allocations, first.economicKind),
  };
}
