import { AppIcon, AppText, Icon, PressScaleTouchable } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import type { PlainInboxRecord } from '@/src/types/plainDtos';
import { formatDate } from '@/src/utils/dateFormatting';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

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

  const isSms = items.some(item => item.channel === 'sms');
  const label = isSms
    ? isEdit
      ? 'Tagged SMS'
      : 'SMS to tag'
    : isEdit
      ? 'Tagged inbox item'
      : 'Inbox item to tag';

  const firstItem = items[0];
  const firstSender = firstItem.senderAddress || (firstItem.channel === 'sms' ? 'SMS' : 'Inbox');
  const displaySender = privateMode ? AppConfig.privacyMask : firstSender;
  const previewSubtitle =
    items.length === 1
      ? `${displaySender} · ${formatDate(firstItem.inputDate)}`
      : `${items.length} linked items`;

  const channelIcon = isSms
    ? Icon.MessageSquare
    : firstItem.channel === 'email'
      ? Icon.Mail
      : firstItem.channel === 'voice'
        ? Icon.Mic
        : Icon.Inbox;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          borderColor: withOpacity(theme.border, Opacity.soft),
        },
      ]}
      testID="journal-entry-inbox-source"
    >
      <PressScaleTouchable
        onPress={() => setIsExpanded(value => !value)}
        pressScale="subtle"
        style={styles.disclosure}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={`${label}, ${items.length} ${items.length === 1 ? 'item' : 'items'}`}
        testID="journal-entry-inbox-source-toggle"
      >
        <View
          style={[
            styles.iconTile,
            {
              backgroundColor: withOpacity(theme.primary, Opacity.soft),
            },
          ]}
        >
          <AppIcon name={channelIcon} size={Size.iconXs} color={theme.primary} />
        </View>

        <View style={styles.headerTextGroup}>
          <AppText variant="caption" color="primary" weight="semibold" style={styles.label}>
            {label}
          </AppText>
          <AppText variant="caption" color="tertiary" numberOfLines={1}>
            {previewSubtitle}
          </AppText>
        </View>

        <View
          style={[
            styles.countPill,
            {
              backgroundColor: withOpacity(theme.surface, Opacity.strong),
              borderColor: withOpacity(theme.border, Opacity.soft),
            },
          ]}
        >
          <AppText variant="caption" color="secondary" weight="medium" tabular>
            {items.length}
          </AppText>
        </View>

        <AppIcon
          name={isExpanded ? Icon.ChevronUp : Icon.ChevronDown}
          size={Size.xs}
          color={theme.textSecondary}
        />
      </PressScaleTouchable>

      {isExpanded ? (
        <View style={styles.expandedContainer}>
          <View
            style={[styles.divider, { backgroundColor: withOpacity(theme.border, Opacity.soft) }]}
          />
          <View style={styles.items}>
            {items.map(item => {
              const itemSender = item.senderAddress || (item.channel === 'sms' ? 'SMS' : 'Inbox');
              const itemDisplaySender = privateMode ? AppConfig.privacyMask : itemSender;
              const rawMessageText = privateMode
                ? 'Message hidden in privacy mode'
                : item.rawBody || 'Message content unavailable';

              return (
                <View
                  key={item.id}
                  style={[
                    styles.itemCard,
                    {
                      backgroundColor: withOpacity(theme.surface, Opacity.medium),
                      borderColor: withOpacity(theme.border, Opacity.soft),
                    },
                  ]}
                  testID={`journal-entry-inbox-item-${item.id}`}
                >
                  <View style={styles.metadata}>
                    <View style={styles.senderBadge}>
                      <AppIcon
                        name={item.channel === 'sms' ? Icon.MessageSquare : Icon.Inbox}
                        size={Size.xxs}
                        color={theme.textTertiary}
                      />
                      <AppText
                        variant="caption"
                        color="secondary"
                        weight="semibold"
                        numberOfLines={1}
                      >
                        {itemDisplaySender}
                      </AppText>
                    </View>
                    <AppText variant="caption" color="tertiary">
                      {formatDate(item.inputDate)}
                    </AppText>
                  </View>

                  <View
                    style={[
                      styles.messageBubble,
                      {
                        backgroundColor: withOpacity(theme.background, Opacity.heavy),
                        borderColor: withOpacity(theme.border, Opacity.soft),
                        borderLeftColor: withOpacity(theme.primary, Opacity.heavy),
                      },
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
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Shape.radius.md,
    overflow: 'hidden',
  },
  disclosure: {
    minHeight: Size.touchTargetLg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  iconTile: {
    width: Size.lg,
    height: Size.lg,
    borderRadius: Shape.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextGroup: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    lineHeight: 16,
  },
  countPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Shape.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
  },
  expandedContainer: {
    width: '100%',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  items: {
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  itemCard: {
    padding: Spacing.sm,
    borderRadius: Shape.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.xs,
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  senderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  messageBubble: {
    padding: Spacing.sm,
    borderRadius: Shape.radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
  },
  messageText: {
    fontSize: Typography.sizes.xs,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
});
