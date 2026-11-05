import type { AccountMatcherSnapshot } from '@/src/types/accountMatcher';
import { observeAccountMatcherSnapshots } from '@/src/services/accounts/accountMatcherPreviewQueries';
import { AppIcon, AppText, Icon, PressScaleTouchable } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useObservable } from '@/src/hooks/useObservable';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/utils/navigation';
import { setAccountMatcherEnabled } from '@/src/services/accounts/accountMatcherCommands';
import type { AccountMatcherProposal } from '@/src/services/sms/recognition/accountMatcherDiscovery';
import type { AccountId } from '@/src/types/ids';
import { toast } from '@/src/utils/alerts';
import { StyleSheet, View } from 'react-native';
import { accountMatcherNeedsAttention } from '../helpers/accountMatcherAttention';
import { useAccountMatcherManagementViewModel } from '../hooks/useAccountMatcherManagementViewModel';
import { useState } from 'react';
import {
  AccountMatcherProposalActions,
  AccountMatcherProposalRow,
  AccountMatcherSuppressedRow,
} from './AccountMatcherProposalRow';
import { AccountMatcherSavedRow } from './AccountMatcherSavedRow';
import { formatDate } from '@/src/utils/dateUtils';

const INITIAL_SUGGESTIONS = 1;

export function AccountMatchersSection({
  accountId,
  eligible,
}: {
  accountId: AccountId;
  eligible: boolean;
}) {
  const { workplaceId } = useWorkplace();
  const { theme } = useTheme();
  const privateMode = useEffectivePrivacyMode();
  const { data: matchers, version: matcherVersion } = useObservable(
    () => observeAccountMatcherSnapshots(workplaceId, accountId),
    [accountId, workplaceId],
    [] as AccountMatcherSnapshot[],
    { resetKey: JSON.stringify([workplaceId, accountId]) },
  );
  const matcherData = useAccountMatcherManagementViewModel(accountId, matchers, matcherVersion);
  const discovery = matcherData;
  const matchedMessages = matcherData;
  const [hiddenForVisit, setHiddenForVisit] = useState<Set<string>>(() => new Set());
  const recognitions = matcherData.recognitions;
  const [actionProposal, setActionProposal] = useState<AccountMatcherProposal | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const proposals = discovery.proposals
    .filter(proposal => !hiddenForVisit.has(proposal.proposalKey))
    .sort(
      (left, right) =>
        right.supportJournalIds.length - left.supportJournalIds.length ||
        right.examples.length - left.examples.length ||
        left.proposalKey.localeCompare(right.proposalKey),
    );
  const visibleProposals = showAll ? proposals : proposals.slice(0, INITIAL_SUGGESTIONS);
  const openProposal = (proposal: AccountMatcherProposal) =>
    AppNavigation.toAccountMatcherEditor(accountId, undefined, proposal.proposalKey);

  const changeEnabled = async (matcherId: string, isEnabled: boolean) => {
    try {
      await setAccountMatcherEnabled(workplaceId, matcherId, isEnabled);
    } catch {
      toast.error(copy.saveError);
    }
  };

  return (
    <View style={styles.section} testID="account-matchers-section">
      <View style={styles.header}>
        <AppText variant="subheading" accessibilityRole="header" style={styles.flex}>
          {copy.messagePatterns}
        </AppText>
        <PressScaleTouchable
          style={styles.textAction}
          onPress={() => AppNavigation.toAccountMatcherEditor(accountId)}
          accessibilityRole="button"
          accessibilityLabel={copy.addMatcher}
          disabled={!eligible}
          accessibilityState={{ disabled: !eligible }}
          testID="add-account-matcher"
        >
          <AppIcon
            name={Icon.Plus}
            size={Size.iconXs}
            color={eligible ? theme.primary : theme.textSecondary}
          />
          <AppText variant="bodySmall" weight="semibold" color={eligible ? 'primary' : 'secondary'}>
            {copy.add}
          </AppText>
        </PressScaleTouchable>
      </View>
      {!eligible ? (
        <AppText variant="caption" color="secondary">
          {copy.suspended}
        </AppText>
      ) : null}

      {matchers.length ? (
        <View style={[styles.group, { backgroundColor: theme.surface }]}>
          {matchers.map((matcher, index) => {
            const attention = accountMatcherNeedsAttention(matcher, recognitions);
            const warning =
              attention === 'invalid'
                ? copy.invalidMatcherWarning
                : attention
                  ? copy.indeterminateWarning
                  : null;
            return (
              <View
                key={matcher.id}
                style={[
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.border,
                  },
                ]}
              >
                <AccountMatcherSavedRow
                  matcher={matcher}
                  eligible={eligible}
                  privateMode={privateMode}
                  warning={warning}
                  matches={matchedMessages.byMatcherId.get(matcher.id)}
                  isLoading={matchedMessages.isLoading}
                  error={matchedMessages.error}
                  onEdit={() => AppNavigation.toAccountMatcherEditor(accountId, matcher.id)}
                  onToggle={value => changeEnabled(matcher.id, value)}
                />
              </View>
            );
          })}
        </View>
      ) : null}

      {matchers.length && !matchedMessages.isLoading ? (
        matchedMessages.error ? (
          <PressScaleTouchable
            style={styles.statusRow}
            onPress={matchedMessages.retry}
            accessibilityRole="button"
          >
            <AppText variant="caption" color="secondary" style={styles.flex}>
              {copy.matchDetailsUnavailable}
            </AppText>
            <AppText variant="bodySmall" color="primary">
              {copy.retry}
            </AppText>
          </PressScaleTouchable>
        ) : (
          <AppText variant="caption" color="secondary">
            {copy.inspected(
              matchedMessages.inspectedCount,
              matchedMessages.inspectedDates
                ? copy.dateRange(
                    formatDate(matchedMessages.inspectedDates.start, { includeTime: false }),
                    formatDate(matchedMessages.inspectedDates.end, { includeTime: false }),
                  )
                : '',
            )}
            {'\n'}
            {copy.matchWindowHint}
          </AppText>
        )
      ) : null}

      {discovery.isLoading ? (
        <View
          style={styles.loading}
          accessibilityLabel={copy.pendingProposals}
          testID="account-matcher-proposals-loading"
        >
          <View style={[styles.skeletonTitle, { backgroundColor: theme.surfaceSecondary }]} />
          <View style={[styles.skeletonDetail, { backgroundColor: theme.surfaceSecondary }]} />
        </View>
      ) : discovery.error ? (
        <PressScaleTouchable
          style={styles.statusRow}
          onPress={discovery.refresh}
          accessibilityRole="button"
          testID="account-matcher-proposals-error"
        >
          <AppText variant="bodySmall" color="secondary" style={styles.flex}>
            {copy.loadError}
          </AppText>
          <AppIcon name={Icon.Refresh} size={Size.iconXs} color={theme.primary} />
        </PressScaleTouchable>
      ) : proposals.length ? (
        <View style={styles.suggestions}>
          <View style={styles.subheader} testID="account-matcher-proposals-title">
            <AppText variant="bodySmall" weight="medium" color="secondary">
              {copy.pendingProposals}
            </AppText>
            <AppText variant="caption" color="secondary" tabular>
              {proposals.length}
            </AppText>
          </View>
          <View style={[styles.group, { backgroundColor: theme.surface }]}>
            {visibleProposals.map((proposal, index) => (
              <AccountMatcherProposalRow
                key={proposal.proposalKey}
                proposal={proposal}
                index={index}
                privateMode={privateMode}
                onOpen={() => openProposal(proposal)}
                onActions={() => setActionProposal(proposal)}
              />
            ))}
          </View>
          {proposals.length > INITIAL_SUGGESTIONS ? (
            <PressScaleTouchable
              style={styles.disclosure}
              accessibilityRole="button"
              accessibilityState={{ expanded: showAll }}
              testID="account-matcher-more-suggestions"
              onPress={() => setShowAll(value => !value)}
            >
              <AppText variant="bodySmall" color="primary">
                {showAll
                  ? copy.showFewer
                  : copy.moreSuggestions(proposals.length - INITIAL_SUGGESTIONS)}
              </AppText>
            </PressScaleTouchable>
          ) : null}
        </View>
      ) : !matchers.length ? (
        <AppText
          variant="bodySmall"
          color="secondary"
          style={styles.empty}
          testID="account-matchers-empty"
        >
          {copy.emptyHint}
        </AppText>
      ) : null}

      {discovery.suppressedProposals.length ? (
        <View>
          <PressScaleTouchable
            style={styles.disclosure}
            onPress={() => setShowDismissed(value => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showDismissed }}
            testID="account-matcher-suppressed-title"
          >
            <AppText variant="bodySmall" color="secondary" style={styles.flex}>
              {copy.showDismissed(discovery.suppressedProposals.length)}
            </AppText>
            <AppIcon
              name={showDismissed ? Icon.ChevronUp : Icon.ChevronDown}
              size={Size.iconXs}
              color={theme.textSecondary}
            />
          </PressScaleTouchable>
          {showDismissed
            ? discovery.suppressedProposals.map((proposal, index) => (
                <AccountMatcherSuppressedRow
                  key={proposal.proposalKey}
                  proposal={proposal}
                  index={index}
                  privateMode={privateMode}
                  onRestore={() => discovery.restore(proposal.proposalKey)}
                />
              ))
            : null}
        </View>
      ) : null}

      <AccountMatcherProposalActions
        proposal={actionProposal}
        onClose={() => setActionProposal(null)}
        onReview={proposal => {
          setActionProposal(null);
          openProposal(proposal);
        }}
        onLater={proposal => {
          setHiddenForVisit(previous => new Set(previous).add(proposal.proposalKey));
          setActionProposal(null);
        }}
        onDismiss={proposal => {
          discovery.dismiss(proposal.proposalKey);
          setActionProposal(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  flex: { flex: 1, minWidth: 0 },
  textAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Size.touchTarget,
    gap: Spacing.xs,
    paddingLeft: Spacing.md,
  },
  group: { borderRadius: Shape.radius.md, overflow: 'hidden' },
  suggestions: { gap: Spacing.sm },
  subheader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  disclosure: {
    minHeight: Size.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: Size.touchTarget,
  },
  empty: { paddingVertical: Spacing.sm },
  loading: { gap: Spacing.sm, paddingVertical: Spacing.md },
  skeletonTitle: { height: Size.xxs, width: '35%', borderRadius: Shape.radius.sm },
  skeletonDetail: { height: Size.xxs, width: '75%', borderRadius: Shape.radius.sm },
});
