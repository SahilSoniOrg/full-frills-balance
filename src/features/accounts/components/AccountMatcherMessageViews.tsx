import { AppIcon, AppText, Icon, ListRow, PressScaleTouchable } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import { useTheme } from '@/src/hooks/use-theme';
import type { AccountMatcherPreviewMessage } from '@/src/types/accountMatcher';
import { formatDate } from '@/src/utils/dateUtils';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { displayPrivate } from '../helpers/displayPrivate';
import { SmsBodyPreview } from './SelectableSmsText';

export function MatcherMessageChoice({
  message,
  privateMode,
  onPress,
  testID,
}: {
  message: AccountMatcherPreviewMessage;
  privateMode: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { theme } = useTheme();
  const sender = displayPrivate(privateMode, message.senderAddress, copy.unknownSender);
  const date = formatDate(message.inputDate, { includeTime: true });
  return (
    <ListRow
      onPress={onPress}
      style={[styles.choice, { borderBottomColor: theme.border }]}
      title={
        <View style={styles.choiceText}>
          <AppText variant="bodySmall" weight="semibold" numberOfLines={1}>
            {sender}
          </AppText>
          <AppText variant="caption" color="secondary">
            {date}
          </AppText>
          <AppText variant="bodySmall" color="secondary" numberOfLines={2} style={styles.snippet}>
            {privateMode ? copy.privateMessage : message.rawBody || copy.selectMessage}
          </AppText>
        </View>
      }
      accessibilityRole="button"
      accessibilityLabel={`${copy.selectMessage}: ${sender}, ${date}`}
      testID={testID}
    />
  );
}

export function MatcherPreviewMessage({
  message,
  spans,
  privateMode,
  accountLabel,
  sourceLabel,
}: {
  message: AccountMatcherPreviewMessage;
  spans: readonly { start: number; end: number }[];
  privateMode: boolean;
  accountLabel?: string;
  sourceLabel?: string;
}) {
  const { theme } = useTheme();
  const metadata = [formatDate(message.inputDate, { includeTime: true }), sourceLabel]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[styles.example, { backgroundColor: theme.surfaceSecondary }]}>
      <AppText variant="bodySmall" weight="semibold">
        {displayPrivate(privateMode, message.senderAddress, copy.unknownSender)}
      </AppText>
      <AppText variant="caption" color="secondary">
        {metadata}
      </AppText>
      {accountLabel ? (
        <AppText variant="caption" color="secondary" numberOfLines={2}>
          {displayPrivate(privateMode, accountLabel)}
        </AppText>
      ) : null}
      <View style={styles.messageBody}>
        <SmsBodyPreview body={message.rawBody ?? ''} spans={spans} privateMode={privateMode} />
      </View>
    </View>
  );
}

/** Evidence stays scannable until the User asks to inspect actual examples. */
export function MatcherEvidenceDisclosure({
  title,
  count,
  children,
  testID,
}: {
  title: string;
  count: number;
  children: ReactNode;
  testID: string;
}) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={[styles.evidence, { borderTopColor: theme.border }]}>
      <PressScaleTouchable
        onPress={() => setExpanded(value => !value)}
        pressScale="subtle"
        style={styles.evidenceToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title}, ${count}`}
        testID={`${testID}-toggle`}
      >
        <AppText variant="bodySmall" weight="medium" style={styles.choiceText}>
          {title}
        </AppText>
        <AppText variant="bodySmall" color="secondary" tabular>
          {count}
        </AppText>
        <AppIcon
          name={expanded ? Icon.ChevronUp : Icon.ChevronDown}
          size={Size.iconXs}
          color="textSecondary"
        />
      </PressScaleTouchable>
      {expanded ? (
        <View style={styles.evidenceBody} testID={testID}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  choice: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  choiceText: { flex: 1, minWidth: 0 },
  snippet: { marginTop: Spacing.sm },
  example: { borderRadius: Shape.radius.md, padding: Spacing.lg, gap: Spacing.xs },
  messageBody: { marginTop: Spacing.sm },
  evidence: { borderTopWidth: StyleSheet.hairlineWidth },
  evidenceToggle: {
    minHeight: Size.touchTargetLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  evidenceBody: { gap: Spacing.md, paddingBottom: Spacing.lg },
});
