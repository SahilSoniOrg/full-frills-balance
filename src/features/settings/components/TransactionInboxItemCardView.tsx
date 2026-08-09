import { MoneyText } from '@/src/components/common/MoneyText';
import { AppButton, AppCard, AppIcon, AppText, Badge } from '@/src/components/core';
import { Opacity, Spacing, withOpacity } from '@/src/constants';
import { InboxProcessingStatus } from '@/src/data/models/TransactionInboxRecord';
import { TransactionInboxItem } from '@/src/types/domain';
import { alert } from '@/src/utils/alerts';
import dayjs from 'dayjs';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

interface TransactionInboxItemCardViewProps {
  item: TransactionInboxItem;
  currencyCode: string;
  handleDismiss: (item: TransactionInboxItem) => Promise<void>;
  handleUndismiss: (item: TransactionInboxItem) => Promise<void>;
  handleImport: (item: TransactionInboxItem) => void;
  onCompareDuplicate: (item: TransactionInboxItem) => void;
  onOpenJournal: (item: TransactionInboxItem) => void;
  testID?: string;
}

export function TransactionInboxItemCardView({
  item,
  currencyCode,
  handleDismiss,
  handleUndismiss,
  handleImport,
  onCompareDuplicate,
  onOpenJournal,
  testID,
}: TransactionInboxItemCardViewProps) {
  const { theme } = useTheme();

  const channelIcon = item.channel === 'voice' ? 'mic' : 'messageSquare';
  const channelLabel = item.channel === 'voice' ? 'Spoken' : 'SMS';

  return (
    <AppCard style={styles.card} testID={testID}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <View style={styles.channelHeader}>
            <AppIcon name={channelIcon} size={14} color={theme.textTertiary} />
            <AppText variant="caption" color="secondary" weight="bold">
              {channelLabel}
            </AppText>
          </View>
          <AppText variant="subheading">
            {item.channel === 'voice'
              ? 'Spoken Draft'
              : item.parsedMerchant || item.senderAddress || 'Unknown Origin'}
          </AppText>
          <AppText variant="caption" color="secondary">
            {dayjs(item.inputDate).format('MMM D, YYYY h:mm A')}
          </AppText>
        </View>
        <View style={styles.amountColumn}>
          {item.parsedAmount != null ? (
            <MoneyText
              amount={item.parsedAmount}
              currencyCode={item.parsedCurrencyCode || currencyCode}
              prefix={item.direction === 'credit' ? '+ ' : '- '}
              variant="subheading"
              style={{ color: item.direction === 'credit' ? theme.success : theme.text }}
            />
          ) : (
            <AppText variant="subheading">No amount</AppText>
          )}
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
        <AppText variant="caption" color="secondary" style={styles.parseReason}>
          {item.parseReason}
        </AppText>
      )}

      {item.duplicateCandidate && (
        <AppButton
          variant="ghost"
          size="sm"
          style={styles.inlineButton}
          onPress={() => onCompareDuplicate(item)}
          testID={`inbox-compare-duplicate-${item.deviceSourceId}`}
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
            alert.show({
              title:
                item.channel === 'voice'
                  ? 'Raw Voice Transcript'
                  : item.senderAddress || 'Raw Message',
              message: item.rawBody || '',
            })
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
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
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
  parseReason: {
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
