import { AppButton, AppCard, AppText, Badge } from '@/src/components/core';
import { Opacity, Spacing, withOpacity } from '@/src/constants';
import { SmsProcessingStatus } from '@/src/data/models/SmsInboxRecord';
import { SmsInboxItem } from '@/src/types/domain';
import { alert } from '@/src/utils/alerts';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { AppNavigation } from '@/src/utils/navigation';
import dayjs from 'dayjs';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface SmsInboxItemCardProps {
  item: SmsInboxItem;
  theme: any;
  currencyCode: string;
  handleDismiss: (item: SmsInboxItem) => Promise<void>;
  handleUndismiss: (item: SmsInboxItem) => Promise<void>;
  handleImport: (item: SmsInboxItem) => void;
}

export function SmsInboxItemCard({
  item,
  theme,
  currencyCode,
  handleDismiss,
  handleUndismiss,
  handleImport,
}: SmsInboxItemCardProps) {
  return (
    <AppCard style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <AppText variant="subheading">{item.parsedMerchant || item.senderAddress}</AppText>
          <AppText variant="caption" color="secondary">
            {dayjs(item.smsDate).format('MMM D, YYYY h:mm A')}
          </AppText>
        </View>
        <View style={styles.amountColumn}>
          <AppText
            variant="subheading"
            style={{ color: item.direction === 'credit' ? theme.success : theme.text }}
          >
            {item.parsedAmount != null
              ? `${item.direction === 'credit' ? '+' : '-'} ${CurrencyFormatter.format(
                  item.parsedAmount,
                  item.parsedCurrencyCode || currencyCode,
                )}`
              : 'No amount'}
          </AppText>
          {item.parsedCurrencyCode && (
            <AppText variant="caption" color="secondary">
              {item.parsedCurrencyCode}
            </AppText>
          )}
        </View>
      </View>

      <View style={styles.badges}>
        <Badge
          size="sm"
          backgroundColor={withOpacity(theme.primary, Opacity.soft)}
          textColor={theme.primary}
        >
          {item.processingStatus.replace(/_/g, ' ')}
        </Badge>
        {item.duplicateCandidate && (
          <Badge
            size="sm"
            backgroundColor={withOpacity(theme.warning, Opacity.soft)}
            textColor={theme.warning}
          >
            likely duplicate
          </Badge>
        )}
        {item.linkedJournal && (
          <Badge
            size="sm"
            backgroundColor={withOpacity(theme.success, Opacity.soft)}
            textColor={theme.success}
          >
            linked journal
          </Badge>
        )}
      </View>

      <AppText variant="body" color="secondary" style={styles.bodyPreview}>
        {item.rawBody}
      </AppText>

      {item.parseReason && (
        <AppText variant="caption" color="secondary">
          {item.parseReason}
        </AppText>
      )}

      {item.duplicateCandidate && (
        <AppButton
          variant="ghost"
          size="sm"
          style={styles.inlineButton}
          onPress={() =>
            AppNavigation.toTransactionDetails(item.duplicateCandidate!.journalId, {
              title:
                item.duplicateCandidate!.description || item.parsedMerchant || item.senderAddress,
              amount: item.parsedAmount || 0,
              currencyCode: item.parsedCurrencyCode || currencyCode,
              date: item.duplicateCandidate!.journalDate,
              displayType: item.direction === 'credit' ? 'INCOME' : 'EXPENSE',
            })
          }
        >
          Compare duplicate
        </AppButton>
      )}

      <View style={styles.actions}>
        {item.linkedJournal ? (
          <AppButton
            size="sm"
            variant="outline"
            onPress={() =>
              AppNavigation.toTransactionDetails(item.linkedJournal!.journalId, {
                title: item.linkedJournal!.description || item.parsedMerchant || item.senderAddress,
                amount: item.parsedAmount || 0,
                currencyCode: item.parsedCurrencyCode || currencyCode,
                date: item.linkedJournal!.journalDate,
                displayType: item.direction === 'credit' ? 'INCOME' : 'EXPENSE',
              })
            }
          >
            Open Journal
          </AppButton>
        ) : (
          <AppButton
            size="sm"
            onPress={() => handleImport(item)}
            disabled={item.processingStatus === SmsProcessingStatus.PARSE_FAILED}
          >
            Import / Review
          </AppButton>
        )}

        {item.processingStatus === SmsProcessingStatus.DISMISSED ? (
          <AppButton size="sm" variant="secondary" onPress={() => handleUndismiss(item)}>
            Undo
          </AppButton>
        ) : (
          <AppButton size="sm" variant="secondary" onPress={() => handleDismiss(item)}>
            Dismiss
          </AppButton>
        )}

        <AppButton
          size="sm"
          variant="ghost"
          onPress={() => alert.show({ title: item.senderAddress, message: item.rawBody })}
        >
          View Raw
        </AppButton>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  amountColumn: {
    alignItems: 'flex-end',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  bodyPreview: {
    marginBottom: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  inlineButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.sm,
  },
});
