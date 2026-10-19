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
): { title: string; body: string } {
  const amountLabel =
    typeof parsed.amount === 'number' && Number.isFinite(parsed.amount)
      ? CurrencyFormatter.formatAmount(parsed.amount, parsed.currencyCode || fallbackCurrencyCode, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })
      : undefined;
  const action =
    parsed.type === 'debit' ? 'spent' : parsed.type === 'credit' ? 'received' : 'transaction';
  const title = amountLabel ? `${amountLabel} ${action}` : 'Transaction to review';
  const merchant = sanitizeDetail(parsed.merchant);
  const source = sanitizeDetail(details.sourceAccountName || parsed.accountSource);
  const category = sanitizeDetail(details.categoryName);
  const parts = [merchant, source, category].filter((part): part is string => Boolean(part));

  return {
    title,
    body: [...(parts.length ? [parts.join(' · ')] : []), 'Tap to review and log.'].join('\n'),
  };
}
