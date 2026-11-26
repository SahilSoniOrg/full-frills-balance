import {
  AppIcon,
  AppText,
  Badge,
  Icon,
  IconTile,
  PressScaleTouchable,
  type IconName,
} from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { transactionCaptureStrings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { BorderWidth, Opacity, Size, Typography } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { Box, Inline, Separator, Stack } from '@/src/design-system';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import type { PlainInboxRecord } from '@/src/types/plainDtos';
import { formatDate } from '@/src/utils/dateFormatting';
import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

function getInboxChannelIcon(channel: PlainInboxRecord['channel']): IconName {
  switch (channel) {
    case 'sms':
      return Icon.MessageSquare;
    case 'email':
      return Icon.Mail;
    case 'voice':
      return Icon.Mic;
    default:
      return Icon.Inbox;
  }
}

function getInboxChannelLabel(channel: PlainInboxRecord['channel']): string {
  switch (channel) {
    case 'sms':
      return transactionCaptureStrings.inboxChannelSms;
    case 'email':
      return transactionCaptureStrings.inboxChannelEmail;
    case 'voice':
      return transactionCaptureStrings.inboxChannelSpoken;
    default:
      return AppConfig.strings.transactionFlow.inboxSource.inboxFallback;
  }
}

export function JournalEntryInboxSource({
  items,
  isEdit,
}: {
  items: PlainInboxRecord[];
  isEdit: boolean;
}) {
  const { theme } = useTheme();
  const privateMode = useEffectivePrivacyMode();
  const [isExpanded, setIsExpanded] = useState(false);
  if (items.length === 0) return null;

  const strings = AppConfig.strings.transactionFlow.inboxSource;
  const isSms = items.some(item => item.channel === 'sms');
  const label = isSms
    ? isEdit
      ? strings.taggedSms
      : strings.smsToTag
    : isEdit
      ? strings.taggedInboxItem
      : strings.inboxItemToTag;

  const firstItem = items[0];
  const firstSender = firstItem.senderAddress || getInboxChannelLabel(firstItem.channel);
  const displaySender = privateMode ? AppConfig.privacyMask : firstSender;
  const previewSubtitle =
    items.length === 1
      ? `${displaySender} · ${formatDate(firstItem.inputDate)}`
      : strings.linkedItemsCount(items.length);

  const headerIcon = getInboxChannelIcon(isSms ? 'sms' : firstItem.channel);
  const softBorderStyle = { borderColor: withOpacity(theme.border, Opacity.soft) };

  return (
    <Box
      marginHorizontal="md"
      marginTop="md"
      marginBottom="sm"
      background="background"
      borderRadius="md"
      borderWidth={StyleSheet.hairlineWidth}
      overflow="hidden"
      style={softBorderStyle}
      testID="journal-entry-inbox-source"
    >
      <PressScaleTouchable
        onPress={() => setIsExpanded(value => !value)}
        pressScale="subtle"
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={strings.accessibilitySummary(label, items.length)}
        testID="journal-entry-inbox-source-toggle"
      >
        <Inline
          align="center"
          gap="sm"
          paddingHorizontal="md"
          paddingVertical="sm"
          minHeight={Size.touchTargetLg}
        >
          <IconTile icon={headerIcon} tint="primary" size="md" />

          <Stack flex={1} justify="center" gap="xs">
            <AppText variant="caption" color="primary" weight="semibold">
              {label}
            </AppText>
            <AppText variant="caption" color="tertiary" numberOfLines={1}>
              {previewSubtitle}
            </AppText>
          </Stack>

          <Badge size="sm" variant="default">
            {items.length}
          </Badge>

          <AppIcon
            name={isExpanded ? Icon.ChevronUp : Icon.ChevronDown}
            size={Size.iconXs}
            color="textSecondary"
          />
        </Inline>
      </PressScaleTouchable>

      {isExpanded ? (
        <Stack width="100%">
          <Separator space={StyleSheet.hairlineWidth} opacity={Opacity.soft} />
          <Stack padding="sm" gap="sm">
            {items.map(item => {
              const itemSender = item.senderAddress || getInboxChannelLabel(item.channel);
              const itemDisplaySender = privateMode ? AppConfig.privacyMask : itemSender;
              const rawMessageText = privateMode
                ? AppConfig.strings.journalDetails.hiddenSms
                : item.rawBody || strings.messageUnavailable;

              return (
                <Stack
                  key={item.id}
                  padding="sm"
                  borderRadius="sm"
                  borderWidth={StyleSheet.hairlineWidth}
                  gap="xs"
                  background="surface"
                  backgroundOpacity="medium"
                  style={softBorderStyle}
                  testID={`journal-entry-inbox-item-${item.id}`}
                >
                  <Inline align="center" justify="space-between" gap="sm">
                    <Inline align="center" gap="xs" flex={1}>
                      <AppIcon
                        name={getInboxChannelIcon(item.channel)}
                        size={Size.xxs}
                        color="textTertiary"
                      />
                      <AppText
                        variant="caption"
                        color="secondary"
                        weight="semibold"
                        numberOfLines={1}
                        style={styles.senderText}
                      >
                        {itemDisplaySender}
                      </AppText>
                    </Inline>
                    <AppText variant="caption" color="tertiary">
                      {formatDate(item.inputDate)}
                    </AppText>
                  </Inline>

                  <Box
                    padding="sm"
                    borderRadius="xs"
                    borderWidth={StyleSheet.hairlineWidth}
                    borderLeftWidth={BorderWidth.focus}
                    background="background"
                    backgroundOpacity="heavy"
                    style={[
                      softBorderStyle,
                      { borderLeftColor: withOpacity(theme.primary, Opacity.heavy) },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      color="secondary"
                      style={styles.messageText}
                      selectable
                    >
                      {rawMessageText}
                    </AppText>
                  </Box>
                </Stack>
              );
            })}
          </Stack>
        </Stack>
      ) : null}
    </Box>
  );
}

const caption = Typography.roles.caption;
const messageLineHeight =
  Platform.OS === 'android' ? Math.round(caption.lineHeight) : caption.lineHeight;

const styles = StyleSheet.create({
  senderText: {
    flexShrink: 1,
  },
  messageText: {
    fontSize: caption.fontSize,
    lineHeight: messageLineHeight,
    letterSpacing: caption.letterSpacing,
  },
});
