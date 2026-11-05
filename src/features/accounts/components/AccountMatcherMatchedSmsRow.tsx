import { AppIcon, AppText, Icon, ListRow, PressScaleTouchable } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppConfig } from '@/src/constants/app-config';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import { Size, Spacing } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import type { AccountMatcherMatchedMessage } from '@/src/services/accounts/accountMatcherMatchQueries';
import { TransactionDirection } from '@/src/types/enums';
import { formatDate } from '@/src/utils/dateUtils';
import { AppNavigation } from '@/src/utils/navigation';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { displayPrivate } from '../helpers/displayPrivate';
import { SmsBodyPreview } from './SelectableSmsText';

export function AccountMatcherMatchedSmsRow({
  match: { message, spans, journal },
  matcherId,
  privateMode,
}: {
  match: AccountMatcherMatchedMessage;
  matcherId: string;
  privateMode: boolean;
}) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const merchant = message.parsedMerchant?.trim();
  const amount = message.parsedAmount;
  const currencyCode = message.parsedCurrencyCode;
  const direction =
    message.direction === TransactionDirection.DEBIT
      ? copy.debit
      : message.direction === TransactionDirection.CREDIT
        ? copy.credit
        : null;
  const sender = displayPrivate(privateMode, message.senderAddress, copy.unknownSender);
  const title = privateMode
    ? AppConfig.privacyMask
    : merchant ||
      (message.direction === TransactionDirection.DEBIT
        ? copy.debitSms
        : message.direction === TransactionDirection.CREDIT
          ? copy.creditSms
          : sender);
  const date = formatDate(message.inputDate, { includeTime: false });
  const metadata = !privateMode && merchant && direction ? `${direction} · ${date}` : date;
  const journalTitle = privateMode
    ? AppConfig.privacyMask
    : journal?.description ||
      (journal ? formatDate(journal.journalDate, { includeTime: false }) : '');

  return (
    <View
      style={[styles.row, { borderTopColor: theme.border }]}
      testID={`account-matcher-match-${matcherId}-${message.id}`}
    >
      <PressScaleTouchable
        onPress={() => setExpanded(value => !value)}
        style={styles.smsSummary}
        pressScale="subtle"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        testID={`account-matcher-read-sms-${matcherId}-${message.id}`}
      >
        <View style={styles.summaryLine}>
          <AppText variant="bodySmall" weight="medium" style={styles.flex} numberOfLines={2}>
            {title}
          </AppText>
          {amount != null && Number.isFinite(amount) && currencyCode ? (
            privateMode ? (
              <AppText variant="bodySmall">{AppConfig.privacyMask}</AppText>
            ) : (
              <MoneyText
                amount={amount}
                currencyCode={currencyCode}
                variant="bodySmall"
                style={styles.amount}
              />
            )
          ) : null}
        </View>
        <View style={styles.summaryLine}>
          <AppText variant="caption" color="secondary" style={styles.flex}>
            {metadata}
          </AppText>
          <AppText variant="caption" color="primary">
            {expanded ? copy.hideSms : copy.readSms}
          </AppText>
        </View>
      </PressScaleTouchable>
      {expanded ? (
        <View
          style={styles.originalMessage}
          testID={`account-matcher-sms-${matcherId}-${message.id}`}
        >
          <AppText variant="caption" color="secondary">
            {sender}
          </AppText>
          <SmsBodyPreview body={message.rawBody ?? ''} spans={spans} privateMode={privateMode} />
        </View>
      ) : null}
      {journal ? (
        <ListRow
          onPress={() => AppNavigation.toJournalDetails(journal.id)}
          leading={<AppIcon name={Icon.Document} size={Size.iconXs} color={theme.textSecondary} />}
          title={journalTitle}
          subtitle={copy.linkedJournal}
          style={styles.journalLink}
          accessibilityRole="button"
          accessibilityLabel={`${copy.openLinkedJournal}: ${journalTitle}`}
          testID={`account-matcher-journal-${matcherId}-${message.id}`}
        />
      ) : (
        <AppText variant="caption" color="secondary">
          {message.linkedJournalId ? copy.linkedJournalUnavailable : copy.unlinkedMessage}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
  },
  flex: { flex: 1, minWidth: 0 },
  smsSummary: { minHeight: Size.touchTarget, gap: Spacing.xs },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.md,
  },
  amount: { flexShrink: 1, textAlign: 'right' },
  originalMessage: { gap: Spacing.sm },
  journalLink: { marginHorizontal: -Spacing.lg },
});
