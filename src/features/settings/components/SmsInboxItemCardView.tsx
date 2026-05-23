import { AppButton, AppCard, AppText, Badge } from '@/src/components/core';
import { Opacity, Spacing, withOpacity } from '@/src/constants';
import { InboxProcessingStatus } from '@/src/data/models/TransactionInboxRecord';
import { TransactionInboxItem } from '@/src/types/domain';
import { alert } from '@/src/utils/alerts';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import dayjs from 'dayjs';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface SmsInboxItemCardViewProps {
  item: TransactionInboxItem;
  currencyCode: string;
  handleDismiss: (item: TransactionInboxItem) => Promise<void>;
  handleUndismiss: (item: TransactionInboxItem) => Promise<void>;
  handleImport: (item: TransactionInboxItem) => void;
  onCompareDuplicate: (item: TransactionInboxItem) => void;
  onOpenJournal: (item: TransactionInboxItem) => void;
}

export function SmsInboxItemCardView({
  item,
  currencyCode,
  handleDismiss,
  handleUndismiss,
  handleImport,
  onCompareDuplicate,
  onOpenJournal,
}: SmsInboxItemCardViewProps) {
  const { theme } = useTheme();
  return (
    <AppCard style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <AppText variant="subheading">{item.parsedMerchant || item.senderAddress}</AppText>
          <AppText variant="caption" color="secondary">
            {dayjs(item.inputDate).format('MMM D, YYYY h:mm A')}
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
          onPress={() => onCompareDuplicate(item)}
        >
          Compare duplicate
        </AppButton>
      )}

      <View style={styles.actions}>
        {item.linkedJournal ? (
          <AppButton size="sm" variant="outline" onPress={() => onOpenJournal(item)}>
            Open Journal
          </AppButton>
        ) : (
          <AppButton
            size="sm"
            onPress={() => handleImport(item)}
            disabled={item.processingStatus === InboxProcessingStatus.PARSE_FAILED}
          >
            Import / Review
          </AppButton>
        )}

        {item.processingStatus === InboxProcessingStatus.DISMISSED ? (
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
          onPress={() =>
            alert.show({ title: item.senderAddress || 'Unknown', message: item.rawBody || '' })
          }
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
