import { AppIcon, AppText, Icon, PressScaleTouchable } from '@/src/components/core';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import { Size, Spacing } from '@/src/constants/design-tokens';
import { InboxProcessingStatus } from '@/src/types/enums';
import { formatDate } from '@/src/utils/dateUtils';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { AccountMatcherEditorViewModel } from '../hooks/details/types';
import { MatcherEvidenceDisclosure, MatcherPreviewMessage } from './AccountMatcherMessageViews';
import { ShowMoreList } from './ShowMorePager';

function PagedEvidenceList<T>({
  title,
  testID,
  items,
  keyExtractor,
  renderItem,
}: {
  title: string;
  testID: string;
  items: readonly T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}) {
  if (!items.length) return null;
  return (
    <MatcherEvidenceDisclosure title={title} count={items.length} testID={testID}>
      <ShowMoreList items={items} keyExtractor={keyExtractor} renderItem={renderItem} />
    </MatcherEvidenceDisclosure>
  );
}

export function AccountMatcherEvidencePreview({ vm }: { vm: AccountMatcherEditorViewModel }) {
  const [showPreviewDetails, setShowPreviewDetails] = useState(false);
  const range = vm.inspectedDates
    ? copy.dateRange(
        formatDate(vm.inspectedDates.start, { includeTime: false }),
        formatDate(vm.inspectedDates.end, { includeTime: false }),
      )
    : '';
  return (
    <View style={styles.section}>
      <View style={styles.previewHeader}>
        <AppText variant="subheading" style={styles.flex}>
          {copy.preview}
        </AppText>
        <PressScaleTouchable
          onPress={() => setShowPreviewDetails(value => !value)}
          style={styles.infoButton}
          accessibilityRole="button"
          accessibilityLabel={copy.previewDetails}
          accessibilityState={{ expanded: showPreviewDetails }}
        >
          <AppIcon name={Icon.Info} size={Size.iconSm} color="textSecondary" />
        </PressScaleTouchable>
      </View>
      <AppText variant="caption" color="secondary" testID="account-matcher-inspected-range">
        {copy.inspected(vm.inspectedCount, range)}
      </AppText>
      {showPreviewDetails ? (
        <AppText variant="bodySmall" color="secondary">
          {copy.boundedPreviewNote}
        </AppText>
      ) : null}
      {vm.allSupportingExamplesAutoPosted ? (
        <AppText variant="bodySmall" color="secondary" accessibilityRole="alert">
          {copy.allAutoPostedWarning}
        </AppText>
      ) : null}
      {vm.existingMatcher ? (
        <AppText variant="caption" color="secondary">
          {copy.coverage(vm.existingCoverage, vm.draftCoverage)}
        </AppText>
      ) : null}
      <PagedEvidenceList
        title={copy.matchingMessages}
        testID="account-matcher-supporting-examples"
        items={vm.supportingExamples}
        keyExtractor={item => item.message.id}
        renderItem={({ message, spans }) => (
          <MatcherPreviewMessage
            message={message}
            spans={spans}
            privateMode={vm.privateMode}
            accountLabel={message.linkedAccountNames.join(', ') || undefined}
            sourceLabel={
              message.linkedJournalId
                ? message.processingStatus === InboxProcessingStatus.AUTO_POSTED
                  ? copy.autoPosted
                  : copy.linkedManually
                : vm.selectedExample?.id === message.id
                  ? copy.selectedMessage
                  : copy.appMessage
            }
          />
        )}
      />
      {vm.supportingExamples.length ? null : (
        <AppText variant="bodySmall" color="secondary">
          {copy.noPreviewMatches}
        </AppText>
      )}
      <PagedEvidenceList
        title={copy.unmatchedMessages}
        testID="account-matcher-linked-misses"
        items={vm.linkedMisses}
        keyExtractor={message => message.id}
        renderItem={message => (
          <MatcherPreviewMessage
            message={message}
            spans={[]}
            privateMode={vm.privateMode}
            accountLabel={vm.accountName}
          />
        )}
      />
      <PagedEvidenceList
        title={copy.otherAccounts}
        testID="account-matcher-overlaps"
        items={vm.overlaps}
        keyExtractor={overlap => overlap.message.id}
        renderItem={overlap => (
          <MatcherPreviewMessage
            message={overlap.message}
            privateMode={vm.privateMode}
            spans={
              vm.supportingExamples.find(item => item.message.id === overlap.message.id)?.spans ??
              []
            }
            accountLabel={overlap.accountNames.join(', ') || undefined}
          />
        )}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: Spacing.md },
  previewHeader: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1, minWidth: 0 },
  infoButton: {
    minHeight: Size.touchTarget,
    minWidth: Size.touchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
