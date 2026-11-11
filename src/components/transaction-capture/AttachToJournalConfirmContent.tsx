import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { transactionCaptureStrings as copy } from '@/src/constants/copy/domains/transactionCaptureStrings';
import type {
  JournalLinkConfirmMode,
  JournalLinkConfirmTarget,
} from '@/src/utils/attachToJournalConfirm';
import type { PlainInboxRecord } from '@/src/types/plainDtos';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { formatDateKeepingPattern } from '@/src/utils/dateUtils';
import type { ResolvedHourCycle } from '@/src/utils/hourCycle';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

const BODY_PREVIEW_LIMIT = 220;

function truncateBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= BODY_PREVIEW_LIMIT) return trimmed;
  return `${trimmed.slice(0, BODY_PREVIEW_LIMIT - 1)}…`;
}

function formatInboxAmount(inbox: PlainInboxRecord, defaultCurrencyCode: string): string {
  const currency = inbox.parsedCurrencyCode || defaultCurrencyCode;
  const prefix = inbox.direction === 'credit' ? '+ ' : inbox.direction === 'debit' ? '- ' : '';
  return formatMoneyAmount(inbox.parsedAmount ?? 0, currency, false, { prefix });
}

type AttachToJournalConfirmContentProps = {
  inbox: PlainInboxRecord | null;
  journal: JournalLinkConfirmTarget | null;
  journalLabel: string;
  hourCycle: ResolvedHourCycle;
  defaultCurrencyCode: string;
  mode?: JournalLinkConfirmMode;
};

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
      {typeof children === 'string' ? <AppText variant="body">{children}</AppText> : children}
    </View>
  );
}

/** Structured inbox ↔ journal summary for attach/detach confirmation dialogs. */
export function AttachToJournalConfirmContent({
  inbox,
  journal,
  journalLabel,
  hourCycle,
  defaultCurrencyCode,
  mode = 'attach',
}: AttachToJournalConfirmContentProps) {
  return (
    <View style={styles.container} testID="attach-to-journal-confirm-content">
      <AppText variant="caption" weight="bold" color="secondary">
        {copy.attachToJournalConfirmInboxHeading}
      </AppText>
      {inbox ? (
        <View style={styles.section}>
          <DetailRow label={copy.attachToJournalConfirmMerchantLabel}>
            {inbox.parsedMerchant?.trim() || inbox.senderAddress?.trim() || 'Unknown'}
          </DetailRow>
          {inbox.parsedAmount != null ? (
            <DetailRow label={copy.attachToJournalConfirmAmountLabel}>
              {formatInboxAmount(inbox, defaultCurrencyCode)}
            </DetailRow>
          ) : null}
          {inbox.senderAddress?.trim() && inbox.parsedMerchant?.trim() ? (
            <DetailRow label={copy.attachToJournalConfirmSenderLabel}>
              {inbox.senderAddress.trim()}
            </DetailRow>
          ) : null}
          <DetailRow label={copy.attachToJournalConfirmDateLabel}>
            {formatDateKeepingPattern(inbox.inputDate, 'MMM D, YYYY', hourCycle, ' ')}
          </DetailRow>
          {inbox.rawBody?.trim() ? (
            <DetailRow label={copy.attachToJournalConfirmBodyLabel}>
              <AppText variant="caption">{truncateBody(inbox.rawBody)}</AppText>
            </DetailRow>
          ) : null}
        </View>
      ) : (
        <AppText variant="caption" color="secondary">
          {copy.attachToJournalConfirmInboxUnavailable}
        </AppText>
      )}

      <AppText variant="caption" weight="bold" color="secondary" style={styles.journalHeading}>
        {mode === 'detach'
          ? copy.detachFromJournalConfirmJournalHeading
          : copy.attachToJournalConfirmJournalHeading}
      </AppText>
      <View style={styles.section}>
        <AppText variant="body" weight="semibold">
          {journalLabel}
        </AppText>
        {journal ? (
          <View style={styles.journalMeta}>
            <AppText variant="caption">
              {formatMoneyAmount(
                journal.totalAmount,
                journal.currencyCode || defaultCurrencyCode,
                false,
              )}
            </AppText>
            <AppText variant="caption" color="secondary">
              {formatDateKeepingPattern(journal.journalDate, 'MMM D, YYYY', hourCycle, ' ')}
            </AppText>
          </View>
        ) : null}
      </View>

      <AppText variant="caption" color="secondary">
        {mode === 'detach'
          ? copy.detachFromJournalConfirmFooter
          : copy.attachToJournalConfirmFooter}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  section: {
    gap: Spacing.sm,
  },
  row: {
    gap: 2,
  },
  journalHeading: {
    marginTop: Spacing.xs,
  },
  journalMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
