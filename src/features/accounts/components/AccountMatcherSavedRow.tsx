import {
  AppButton,
  AppIcon,
  AppText,
  AppToggle,
  Icon,
  PressScaleTouchable,
} from '@/src/components/core';
import { Size, Spacing } from '@/src/constants/design-tokens';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import type { AccountMatcherSnapshot } from '@/src/types/accountMatcher';
import { useTheme } from '@/src/hooks/use-theme';
import type { AccountMatcherMatches } from '@/src/services/accounts/accountMatcherMatchQueries';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { storedAccountMatcherPresentation } from '../helpers/accountMatcherSummary';
import { displayPrivate } from '../helpers/displayPrivate';
import { AccountMatcherConditions } from './AccountMatcherConditions';
import { AccountMatcherMatchedSmsRow } from './AccountMatcherMatchedSmsRow';

export function AccountMatcherSavedRow({
  matcher,
  eligible,
  privateMode,
  warning,
  matches,
  isLoading,
  error,
  onEdit,
  onToggle,
}: {
  matcher: Pick<AccountMatcherSnapshot, 'id' | 'definitionJson' | 'isEnabled'>;
  eligible: boolean;
  privateMode: boolean;
  warning: string | null;
  matches?: AccountMatcherMatches;
  isLoading: boolean;
  error: string | null;
  onEdit: () => void;
  onToggle: (enabled: boolean) => Promise<void>;
}) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(3);
  const [isToggling, setIsToggling] = useState(false);
  const presentation = storedAccountMatcherPresentation(matcher);
  const title = displayPrivate(
    privateMode,
    presentation.definition?.sender
      ? copy.senderCondition(presentation.definition.sender.value)
      : presentation.title,
  );
  const changeEnabled = async (enabled: boolean) => {
    if (isToggling) return;
    setIsToggling(true);
    try {
      await onToggle(enabled);
    } finally {
      setIsToggling(false);
    }
  };
  const summary = isLoading
    ? copy.loadingMatches
    : error
      ? copy.matchDetailsUnavailable
      : copy.matchedSmsSummary(matches?.messages.length ?? 0, matches?.journals.length ?? 0);
  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <PressScaleTouchable
          onPress={onEdit}
          style={styles.editAction}
          pressScale="subtle"
          accessibilityRole="button"
          accessibilityLabel={`${copy.editMatcher}: ${title}`}
          testID={`account-matcher-${matcher.id}`}
        >
          <AppText variant="subheading" numberOfLines={2} style={styles.flex}>
            {title}
          </AppText>
          <AppIcon name={Icon.Edit} size={Size.iconXs} color={theme.textSecondary} />
        </PressScaleTouchable>
        <View style={styles.toggle} testID={`account-matcher-switch-${matcher.id}`}>
          <AppToggle
            value={matcher.isEnabled}
            disabled={isToggling || (!eligible && !matcher.isEnabled)}
            onValueChange={value => void changeEnabled(value)}
            accessibilityLabel={`${matcher.isEnabled ? copy.disabled : copy.enabled}: ${title}`}
          />
        </View>
      </View>
      <AccountMatcherConditions
        definition={presentation.definition}
        privateMode={privateMode}
        matcherId={matcher.id}
      />
      {warning ? (
        <AppText variant="caption" color="warning" style={styles.warning}>
          {warning}
        </AppText>
      ) : null}
      <PressScaleTouchable
        onPress={() => setExpanded(value => !value)}
        style={[styles.disclosure, { borderTopColor: theme.border }]}
        pressScale="subtle"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={summary}
        testID={`account-matcher-matches-${matcher.id}`}
      >
        {isLoading || error ? (
          <AppText variant="bodySmall" color="secondary" style={styles.flex}>
            {summary}
          </AppText>
        ) : (
          <View style={[styles.flex, styles.coverage]}>
            <AppText variant="bodySmall" weight="medium">
              {copy.matchingSmsCount(matches?.messages.length ?? 0)}
            </AppText>
            <AppText variant="caption" color="secondary">
              {copy.linkedJournalsCount(matches?.journals.length ?? 0)}
            </AppText>
          </View>
        )}
        <AppIcon
          name={expanded ? Icon.ChevronUp : Icon.ChevronDown}
          size={Size.iconXs}
          color={theme.textSecondary}
        />
      </PressScaleTouchable>
      {expanded ? (
        <View testID={`account-matcher-match-details-${matcher.id}`}>
          {!matcher.isEnabled ? (
            <AppText variant="caption" color="secondary" style={styles.note}>
              {copy.disabledMatchesNote}
            </AppText>
          ) : null}
          {matches?.indeterminateCount ? (
            <AppText variant="caption" color="warning" style={styles.note}>
              {copy.incompleteMatches}
            </AppText>
          ) : null}
          {!isLoading && !error && !matches?.messages.length ? (
            <AppText variant="bodySmall" color="secondary" style={styles.note}>
              {copy.noMatchedMessages}
            </AppText>
          ) : null}
          {!error &&
            matches?.messages
              .slice(0, visibleCount)
              .map(match => (
                <AccountMatcherMatchedSmsRow
                  key={match.message.id}
                  match={match}
                  matcherId={matcher.id}
                  privateMode={privateMode}
                />
              ))}
          {!error && matches && visibleCount < matches.messages.length ? (
            <AppButton variant="ghost" onPress={() => setVisibleCount(count => count + 10)}>
              {copy.showMoreMessages}
            </AppButton>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { padding: Spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  flex: { flex: 1, minWidth: 0 },
  editAction: {
    flex: 1,
    minWidth: 0,
    minHeight: Size.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  toggle: { minHeight: Size.touchTarget, justifyContent: 'center', alignItems: 'flex-end' },
  warning: { marginTop: Spacing.sm },
  disclosure: {
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: Size.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  coverage: { gap: Spacing.xs },
  note: { paddingBottom: Spacing.md },
});
