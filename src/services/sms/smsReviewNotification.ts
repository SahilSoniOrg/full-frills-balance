import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';

function sanitizeDetail(value?: string | null): string | undefined {
  const cleaned = value
    ?.replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, 60) : undefined;
}

export function formatSmsReviewNotification(
  parsed: Pick<
    ParsedTransaction,
    'amount' | 'currencyCode' | 'type' | 'merchant' | 'accountSource'
  >,
  fallbackCurrencyCode: string,
  details: { sourceAccountName?: string; categoryName?: string } = {},
): string {
  const amountLabel =
    typeof parsed.amount === 'number' && Number.isFinite(parsed.amount)
      ? CurrencyFormatter.formatAmount(
          parsed.amount,
          parsed.currencyCode || fallbackCurrencyCode,
          { minimumFractionDigits: 0, maximumFractionDigits: 2 },
        )
      : undefined;
  const action =
    parsed.type === 'debit'
      ? 'you spent'
      : parsed.type === 'credit'
        ? 'you received'
        : 'transaction';
  const message = [amountLabel, action].filter(Boolean).join(' ');
  const merchant = sanitizeDetail(parsed.merchant);
  const source = sanitizeDetail(details.sourceAccountName || parsed.accountSource);
  const category = sanitizeDetail(details.categoryName);
  const parts = [
    merchant && `at ${merchant}`,
    source && `from ${source}`,
    category && `for ${category}`,
  ].filter((part): part is string => Boolean(part));

  return `Come log ${message}${parts.length ? ` ${parts.join(' ')}` : ''}.`;
}
