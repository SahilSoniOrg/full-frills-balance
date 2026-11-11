import { transactionCaptureStrings as copy } from '@/src/constants/copy/domains/transactionCaptureStrings';
import type { PlainInboxRecord } from '@/src/types/plainDtos';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { formatDateKeepingPattern } from '@/src/utils/dateUtils';
import type { ResolvedHourCycle } from '@/src/utils/hourCycle';

const BODY_PREVIEW_LIMIT = 220;

function truncateBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= BODY_PREVIEW_LIMIT) return trimmed;
  return `${trimmed.slice(0, BODY_PREVIEW_LIMIT - 1)}…`;
}

function formatInboxAmount(inbox: PlainInboxRecord): string | undefined {
  if (inbox.parsedAmount == null) return undefined;
  const currency = inbox.parsedCurrencyCode || 'USD';
  const prefix = inbox.direction === 'credit' ? '+ ' : inbox.direction === 'debit' ? '- ' : '';
  return formatMoneyAmount(inbox.parsedAmount, currency, false, { prefix });
}

/** Fields the attach/detach confirm needs from a journal details or list model. */
export type JournalLinkConfirmTarget = {
  totalAmount: number;
  currencyCode: string;
  journalDate: number;
  description?: string;
  semanticLabel?: string;
};

function formatJournalAmount(journal: JournalLinkConfirmTarget): string {
  return formatMoneyAmount(journal.totalAmount, journal.currencyCode, false);
}

export type JournalLinkConfirmMode = 'attach' | 'detach';

/** Plain-text confirm body: inbox summary + journal target. */
export function buildAttachToJournalConfirmMessage(args: {
  inbox: PlainInboxRecord | null;
  journal: JournalLinkConfirmTarget | null;
  journalLabel: string;
  hourCycle?: ResolvedHourCycle;
  mode?: JournalLinkConfirmMode;
}): string {
  const { inbox, journal, journalLabel, hourCycle = '12-hour', mode = 'attach' } = args;
  const lines: string[] = [copy.attachToJournalConfirmInboxHeading];

  if (inbox) {
    const merchant = inbox.parsedMerchant?.trim() || inbox.senderAddress?.trim();
    if (merchant) {
      lines.push(`${copy.attachToJournalConfirmMerchantLabel}: ${merchant}`);
    }
    const amount = formatInboxAmount(inbox);
    if (amount) {
      lines.push(`${copy.attachToJournalConfirmAmountLabel}: ${amount}`);
    }
    if (inbox.senderAddress?.trim() && inbox.parsedMerchant?.trim()) {
      lines.push(`${copy.attachToJournalConfirmSenderLabel}: ${inbox.senderAddress.trim()}`);
    }
    if (inbox.inputDate) {
      lines.push(
        `${copy.attachToJournalConfirmDateLabel}: ${formatDateKeepingPattern(inbox.inputDate, 'MMM D, YYYY', hourCycle, ' ')}`,
      );
    }
    if (inbox.rawBody?.trim()) {
      lines.push(`${copy.attachToJournalConfirmBodyLabel}: ${truncateBody(inbox.rawBody)}`);
    }
  } else {
    lines.push(copy.attachToJournalConfirmInboxUnavailable);
  }

  lines.push('');
  lines.push(
    mode === 'detach'
      ? copy.detachFromJournalConfirmJournalHeading
      : copy.attachToJournalConfirmJournalHeading,
  );
  lines.push(journalLabel);
  if (journal) {
    lines.push(
      `${formatJournalAmount(journal)} · ${formatDateKeepingPattern(journal.journalDate, 'MMM D, YYYY', hourCycle, ' ')}`,
    );
  }
  lines.push('');
  lines.push(
    mode === 'detach' ? copy.detachFromJournalConfirmFooter : copy.attachToJournalConfirmFooter,
  );

  return lines.join('\n');
}
