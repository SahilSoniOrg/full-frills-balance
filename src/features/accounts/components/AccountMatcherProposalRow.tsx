import {
  AppIcon,
  AppText,
  Icon,
  ListGroup,
  ListRow,
  PressScaleTouchable,
} from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Size, Spacing } from '@/src/constants/design-tokens';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import { useTheme } from '@/src/hooks/use-theme';
import type {
  AccountMatcherProposal,
  SuppressedAccountMatcherProposal,
} from '@/src/types/accountMatcher';
import { StyleSheet, View } from 'react-native';
import { accountMatcherPresentation } from '../helpers/accountMatcherSummary';
import { displayPrivate } from '../helpers/displayPrivate';

export function AccountMatcherProposalRow({
  proposal,
  index,
  privateMode,
  onOpen,
  onActions,
}: {
  proposal: AccountMatcherProposal;
  index: number;
  privateMode: boolean;
  onOpen: () => void;
  onActions: () => void;
}) {
  const { theme } = useTheme();
  const presentation = accountMatcherPresentation(proposal.definition);
  const title = displayPrivate(privateMode, presentation.title);
  return (
    <View
      style={[
        styles.suggestionRow,
        index > 0 && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
        },
      ]}
    >
      <ListRow
        style={styles.proposalContent}
        title={
          <View style={styles.proposalText}>
            <AppText variant="body" weight="medium" numberOfLines={1}>
              {title}
            </AppText>
            <AppText variant="bodySmall" color="secondary" numberOfLines={1}>
              {displayPrivate(privateMode, presentation.detail)}
            </AppText>
            <View style={styles.evidence}>
              <AppText variant="caption" color="secondary">
                {copy.proposalEvidence(proposal.examples.length, proposal.supportJournalIds.length)}
              </AppText>
              {proposal.overlaps.length ? (
                <View style={styles.overlap}>
                  <AppIcon name={Icon.Alert} size={Size.xxs} color={theme.warning} />
                  <AppText variant="caption" color="warning">
                    {copy.possibleOverlap}
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>
        }
        accessibilityRole="button"
        accessibilityLabel={`${copy.review}: ${title}`}
        onPress={onOpen}
        testID={`account-matcher-proposal-${index}`}
      />
      <PressScaleTouchable
        style={styles.moreAction}
        onPress={onActions}
        accessibilityRole="button"
        accessibilityLabel={`${copy.suggestionActions}: ${title}`}
        testID={`account-matcher-proposal-actions-${index}`}
      >
        <AppIcon name={Icon.More} size={Size.iconSm} color={theme.textSecondary} />
      </PressScaleTouchable>
    </View>
  );
}

export function AccountMatcherSuppressedRow({
  proposal,
  index,
  privateMode,
  onRestore,
}: {
  proposal: SuppressedAccountMatcherProposal;
  index: number;
  privateMode: boolean;
  onRestore: () => void;
}) {
  const title = displayPrivate(privateMode, accountMatcherPresentation(proposal.definition).title);
  return (
    <PressScaleTouchable
      style={styles.restoreRow}
      onPress={onRestore}
      accessibilityRole="button"
      accessibilityLabel={`${copy.restoreProposal}: ${title}`}
      testID={`account-matcher-suppressed-proposal-${index}`}
    >
      <AppText variant="bodySmall" numberOfLines={1} style={styles.flex}>
        {title}
      </AppText>
      <AppText variant="bodySmall" color="primary">
        {copy.restoreProposal}
      </AppText>
    </PressScaleTouchable>
  );
}

export function AccountMatcherProposalActions({
  proposal,
  onClose,
  onReview,
  onLater,
  onDismiss,
}: {
  proposal: AccountMatcherProposal | null;
  onClose: () => void;
  onReview: (proposal: AccountMatcherProposal) => void;
  onLater: (proposal: AccountMatcherProposal) => void;
  onDismiss: (proposal: AccountMatcherProposal) => void;
}) {
  return (
    <ModalSurface
      visible={Boolean(proposal)}
      title={copy.suggestionActions}
      onClose={onClose}
      position="bottomSheet"
      fixedHeight={false}
      scrollable={false}
    >
      {proposal ? (
        <ListGroup
          variant="plain"
          items={[
            {
              id: 'review',
              title: copy.review,
              icon: Icon.Edit,
              onPress: () => onReview(proposal),
            },
            {
              id: 'later',
              title: copy.notNow,
              icon: Icon.Clock,
              onPress: () => onLater(proposal),
            },
            {
              id: 'dismiss',
              title: copy.dismissProposal,
              icon: Icon.Close,
              onPress: () => onDismiss(proposal),
            },
          ]}
        />
      ) : null}
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  suggestionRow: { flexDirection: 'row', alignItems: 'center' },
  proposalContent: { flex: 1, minWidth: 0 },
  proposalText: { gap: Spacing.xs },
  evidence: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: Spacing.sm,
    rowGap: Spacing.xs,
  },
  overlap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  moreAction: {
    minWidth: Size.touchTarget,
    minHeight: Size.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreRow: {
    minHeight: Size.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
});
