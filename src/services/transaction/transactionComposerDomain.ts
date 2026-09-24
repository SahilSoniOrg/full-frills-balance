import { JournalCalculator } from '@/src/services/accounting/JournalCalculator';
import { parsePositiveRate } from '@/src/services/journal/journalEditorHelpers';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { sanitizeAmount } from '@/src/utils/validation';
import { TransactionType } from '@/src/types/enums';
import {
  PostingPlan,
  PostingPlanValidationResult,
  TransactionDomainIssue,
  TransactionIntent,
  TransactionResolution,
  TransactionResolverAccount,
  TransactionResolverContext,
} from '@/src/types/domainTransaction';
import { JournalEntryLine } from '@/src/types/domainJournal';
import { AccountId, EMPTY_ACCOUNT_ID, asTransactionId } from '@/src/types/ids';
import { evaluateJournalBalance } from '@/src/domain/accounting/journalBalanceEvaluator';

const RESOLUTION_EPSILON = 0.001;

function parsePositiveAmount(value: string | undefined, precision?: number): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = sanitizeAmount(value, precision);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parseDate(value: string): number | null {
  if (!value.trim()) return null;
  const timestamp = new Date(value.includes('T') ? value : `${value}T00:00:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function issue(
  code: TransactionDomainIssue['code'],
  message: string,
  path?: string,
  accountId?: AccountId,
): TransactionDomainIssue {
  return { code, message, path, accountId };
}

function resolveAccount(
  accountId: AccountId | undefined,
  context: TransactionResolverContext,
  path: string,
  issues: TransactionDomainIssue[],
) {
  if (!accountId || accountId === EMPTY_ACCOUNT_ID) {
    const missingCode = path.startsWith('allocations.')
      ? 'missing_allocation_account'
      : path === 'sourceAccountId'
        ? 'missing_source_account'
        : 'missing_destination_account';
    issues.push(
      issue(
        missingCode,
        missingCode === 'missing_source_account'
          ? 'A source account is required'
          : missingCode === 'missing_allocation_account'
            ? 'An allocation account is required'
            : 'A destination account is required',
        path,
      ),
    );
    return undefined;
  }

  const account = context.accounts.find(candidate => candidate.id === accountId);
  if (!account) {
    issues.push(issue('unknown_account', `Account "${accountId}" was not found`, path, accountId));
  }
  return account;
}

function makeLine(input: {
  id: string;
  account: TransactionResolverAccount;
  amount: string;
  transactionType: TransactionType;
  notes: string;
  exchangeRate?: string;
}): JournalEntryLine {
  return {
    id: asTransactionId(input.id),
    accountId: input.account.id,
    accountName: input.account.name,
    accountType: input.account.accountType,
    amount: input.amount.trim(),
    transactionType: input.transactionType,
    notes: input.notes,
    exchangeRate: input.exchangeRate ?? '',
    accountCurrency: input.account.currencyCode,
  };
}

/**
 * Converts an editable intent into accounting lines without performing side effects.
 * Missing information is returned as structured issues so the composer can decide how
 * to reveal the next required input.
 */
export function resolveTransactionIntent(
  intent: TransactionIntent,
  context: TransactionResolverContext,
): TransactionResolution {
  const issues: TransactionDomainIssue[] = [];
  const description = intent.description.trim();
  if (!description)
    issues.push(issue('missing_description', 'A description is required', 'description'));

  if (!intent.date.trim()) {
    issues.push(issue('missing_date', 'A date is required', 'date'));
  }
  const date = parseDate(intent.date);
  if (intent.date.trim() && date === null) {
    issues.push(issue('invalid_date', 'The date is invalid', 'date'));
  }

  const allocations = intent.allocations ?? [];
  const allocationAmounts = allocations.map(allocation => parsePositiveAmount(allocation.amount));
  const hasInvalidAllocation = allocationAmounts.some(amount => amount === null);
  if (hasInvalidAllocation) {
    allocationAmounts.forEach((amount, index) => {
      if (amount === null) {
        issues.push(
          issue(
            'invalid_allocation_amount',
            'Allocation amount must be greater than zero',
            `allocations.${index}.amount`,
          ),
        );
      }
    });
  }

  const derivedAmount =
    allocationAmounts.every(value => value !== null) && allocations.length > 0
      ? String(allocationAmounts.reduce((sum, value) => sum + (value ?? 0), 0))
      : undefined;
  const amountInput = intent.amount ?? derivedAmount;
  const amount = parsePositiveAmount(amountInput);
  if (amount === null) {
    issues.push(
      issue(
        amountInput === undefined || amountInput.trim() === ''
          ? 'missing_amount'
          : 'invalid_amount',
        'An amount greater than zero is required',
        'amount',
      ),
    );
  }

  const source = resolveAccount(intent.sourceAccountId, context, 'sourceAccountId', issues);
  let destinations: {
    account: TransactionResolverAccount;
    amount: string;
    exchangeRate?: string;
    notes: string;
    id: string;
  }[] = [];

  if (intent.allocations && intent.allocations.length > 0) {
    const rawAllocations = intent.allocations;
    destinations = rawAllocations
      .map((allocation, index) => {
        const account = resolveAccount(
          allocation.accountId,
          context,
          `allocations.${index}.accountId`,
          issues,
        );
        if (!account) return undefined;
        return {
          account,
          amount: allocation.amount,
          exchangeRate: allocation.exchangeRate,
          notes: allocation.notes?.trim() || intent.notes?.trim() || '',
          id: allocation.id || `intent-destination-${index + 1}`,
        };
      })
      .filter(
        (destination): destination is NonNullable<typeof destination> => destination !== undefined,
      );
  } else {
    const destination = resolveAccount(
      intent.destinationAccountId,
      context,
      'destinationAccountId',
      issues,
    );
    if (destination && amountInput !== undefined) {
      destinations = [
        {
          account: destination,
          amount: intent.destinationAmount ?? amountInput,
          exchangeRate: intent.destinationExchangeRate,
          notes: intent.notes?.trim() || '',
          id: 'intent-destination',
        },
      ];
    }
  }

  if (intent.allocations && intent.allocations.length > 0) {
    const rawAllocations = intent.allocations;
    const validAllocationTotal = allocationAmounts.every(value => value !== null)
      ? allocationAmounts.reduce((sum, value) => sum + (value ?? 0), 0)
      : null;
    const allAllocationAccountsResolved = destinations.length === rawAllocations.length;
    const amountInBaseCurrency =
      source && amount !== null && allAllocationAccountsResolved
        ? JournalCalculator.getLineBaseAmount(
            {
              amount,
              accountCurrency: source.currencyCode,
              exchangeRate: intent.sourceExchangeRate,
            },
            context.currencyCode,
          )
        : amount;
    const allocationsInBaseCurrency =
      validAllocationTotal !== null && source && allAllocationAccountsResolved
        ? destinations.reduce(
            (sum, destination) =>
              sum +
              JournalCalculator.getLineBaseAmount(
                {
                  amount: destination.amount,
                  accountCurrency: destination.account.currencyCode,
                  exchangeRate: destination.exchangeRate,
                },
                context.currencyCode,
              ),
            0,
          )
        : validAllocationTotal;

    if (
      amountInBaseCurrency !== null &&
      allocationsInBaseCurrency !== null &&
      Math.abs(allocationsInBaseCurrency - amountInBaseCurrency) > RESOLUTION_EPSILON
    ) {
      issues.push(
        issue(
          'allocation_sum_mismatch',
          'Allocations must add up to the transaction amount',
          'allocations',
        ),
      );
    }
  }

  if (issues.length > 0 || !source || date === null || amount === null) {
    return { resolved: false, issues };
  }

  const sourceLine = makeLine({
    id: 'intent-source',
    account: source,
    amount: amountInput?.trim() || amount.toString(),
    transactionType: TransactionType.CREDIT,
    notes: intent.notes?.trim() || '',
    exchangeRate: intent.sourceExchangeRate,
  });
  const destinationLines = destinations.map(destination =>
    makeLine({
      id: destination.id,
      account: destination.account,
      amount: destination.amount,
      transactionType: TransactionType.DEBIT,
      notes: destination.notes,
      exchangeRate: destination.exchangeRate,
    }),
  );

  const plan: PostingPlan = {
    lines: [sourceLine, ...destinationLines],
    currencyCode: context.currencyCode,
    description,
    date,
    notes: intent.notes?.trim() || undefined,
  };
  return { resolved: true, plan, issues: [] };
}

function withPrecisionFallbacks(
  plan: PostingPlan,
  precisionByCurrency: ReadonlyMap<string, number> | undefined,
): Map<string, number> {
  const precisions = new Map(
    [...(precisionByCurrency ?? [])].map(([code, precision]) => [
      code.trim().toUpperCase(),
      precision,
    ]),
  );
  for (const code of [plan.currencyCode, ...plan.lines.map(line => line.accountCurrency)]) {
    const normalizedCode = code?.trim().toUpperCase();
    if (normalizedCode && !precisions.has(normalizedCode)) {
      precisions.set(normalizedCode, CurrencyFormatter.getPrecisionFallback(normalizedCode));
    }
  }
  return precisions;
}

/**
 * Validates a resolved plan against the supplied account snapshot and base currency.
 * Balance is always checked exactly in minor units; currencies missing from
 * `precisionByCurrency` use the static precision table.
 */
export function validatePostingPlan(
  plan: PostingPlan,
  accounts: TransactionResolverContext['accounts'],
  options: { precisionByCurrency?: ReadonlyMap<string, number> } = {},
): PostingPlanValidationResult {
  const issues: PostingPlanValidationResult['issues'] = [];
  const accountMap = new Map(accounts.map(account => [account.id, account]));
  const lineIds = new Set<string>();
  const baseCurrency = plan.currencyCode.trim().toUpperCase();
  const precisionByCurrency = withPrecisionFallbacks(plan, options.precisionByCurrency);

  if (!plan.description.trim())
    issues.push({ code: 'missing_description', message: 'A description is required' });
  if (!/^[A-Z]{3}$/.test(baseCurrency)) {
    issues.push({ code: 'missing_currency', message: 'A three-letter base currency is required' });
  }
  if (!Number.isFinite(plan.date))
    issues.push({ code: 'invalid_date', message: 'A valid journal date is required' });
  if (plan.lines.length < 2)
    issues.push({ code: 'too_few_lines', message: 'A posting plan needs at least two lines' });

  let debitCount = 0;
  let creditCount = 0;
  const distinctAccounts = new Set<AccountId>();
  for (const line of plan.lines) {
    if (lineIds.has(line.id))
      issues.push({
        code: 'duplicate_line_id',
        message: 'Posting line IDs must be unique',
        lineId: line.id,
      });
    lineIds.add(line.id);

    if (!line.accountId || line.accountId === EMPTY_ACCOUNT_ID) {
      issues.push({
        code: 'missing_account',
        message: 'Every posting line needs an account',
        lineId: line.id,
      });
      continue;
    }
    distinctAccounts.add(line.accountId);
    const account = accountMap.get(line.accountId);
    if (!account) {
      issues.push({
        code: 'unknown_account',
        message: `Account "${line.accountId}" was not found`,
        lineId: line.id,
        accountId: line.accountId,
      });
    } else if (
      line.accountName !== account.name ||
      line.accountType !== account.accountType ||
      line.accountCurrency !== account.currencyCode
    ) {
      issues.push({
        code: 'account_metadata_mismatch',
        message: 'Posting line account metadata is stale',
        lineId: line.id,
        accountId: line.accountId,
      });
    }

    const accountPrecision = line.accountCurrency
      ? precisionByCurrency.get(line.accountCurrency.trim().toUpperCase())
      : undefined;
    if (parsePositiveAmount(line.amount, accountPrecision) === null)
      issues.push({
        code: 'invalid_amount',
        message: 'Posting amounts must be greater than zero',
        lineId: line.id,
      });
    if (line.transactionType === TransactionType.DEBIT) debitCount += 1;
    if (line.transactionType === TransactionType.CREDIT) creditCount += 1;

    const lineCurrency = line.accountCurrency?.trim().toUpperCase();
    if (lineCurrency && lineCurrency !== baseCurrency && !line.exchangeRate.trim()) {
      issues.push({
        code: 'missing_exchange_rate',
        message: 'A foreign-currency line needs an exchange rate',
        lineId: line.id,
      });
    } else if (line.exchangeRate.trim() && parsePositiveRate(line.exchangeRate) === null) {
      issues.push({
        code: 'invalid_exchange_rate',
        message: 'Exchange rates must be greater than zero',
        lineId: line.id,
      });
    }
  }

  if (debitCount === 0)
    issues.push({ code: 'missing_debit', message: 'A posting plan needs a debit line' });
  if (creditCount === 0)
    issues.push({ code: 'missing_credit', message: 'A posting plan needs a credit line' });
  if (distinctAccounts.size < 2)
    issues.push({ code: 'missing_account', message: 'A posting plan needs two distinct accounts' });

  if (issues.length === 0) {
    const evaluation = evaluateJournalBalance({
      lines: plan.lines,
      journalCurrency: plan.currencyCode,
      precisionByCurrency,
    });
    issues.push(
      ...evaluation.issues.map(balanceIssue => ({
        code: balanceIssue.code,
        message: balanceIssue.message,
        ...(balanceIssue.lineId ? { lineId: asTransactionId(balanceIssue.lineId) } : {}),
      })),
    );
  }

  return { valid: issues.length === 0, issues };
}
