import { EmptyStateView, Icon, LoadingView } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import { privacyNavChrome } from '@/src/components/layout/privacyNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Spacing } from '@/src/constants/design-tokens';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { Stack } from '@/src/design-system';
import type { JournalId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import {
  JournalBalanceReviewFlow,
  type JournalBalanceEntryAction,
  type JournalBalanceReviewCopy,
} from './JournalBalanceReviewFlow';
import { useJournalBalanceReviewViewModel } from './useJournalBalanceReviewViewModel';

const SAVED_ENTRY_COPY: JournalBalanceReviewCopy = {
  untitledEntry: 'Journal entry',
  intro:
    "These posted entries don't balance, so the accounts they touch may show the wrong balance. Fix them one at a time, or apply a calculated rate where the account amounts uniquely determine it.",
  suggestionsNote:
    'These suggestions balance each entry using its account amounts, which stay unchanged. Review or edit any rate before applying.',
  fxExplanation:
    'This rate is recalculated from the account amounts so the entry balances; those amounts stay unchanged. Review or edit it before applying.',
  editorHint:
    'Edit the amounts or rate below; the entry must balance before it can be saved. Historical rate suggestions use the journal date shown above.',
  saveLabel: 'Save changes',
  applySuggestionsLabel: count => `Apply ${count} suggested ${count === 1 ? 'rate' : 'rates'}`,
  rateLabels: {
    imported: 'Rate saved with this entry',
    implied: 'Calculated from the account amounts',
    invalid: 'Saved rate is invalid',
  },
};

function JournalBalanceReviewScreen() {
  const vm = useJournalBalanceReviewViewModel();
  const chrome = useMemo<ScreenNavChrome>(
    () => privacyNavChrome('Unbalanced Entries', AppNavigation.back),
    [],
  );
  const openInEditor = useMemo<JournalBalanceEntryAction<JournalId>>(
    () => ({
      testIDSegment: 'open-editor',
      label: 'Open in editor',
      detailLabel: 'Open in editor',
      variant: 'outline',
      onPress: vm.onOpenInEditor,
    }),
    [vm.onOpenInEditor],
  );

  let content;
  if (vm.loadError && !vm.entries) {
    content = (
      <EmptyStateView
        icon={Icon.Alert}
        title="Could not check your entries"
        subtitle={vm.loadError}
        primaryActionLabel="Try again"
        onPrimaryAction={vm.onRetry}
      />
    );
  } else if (!vm.entries) {
    content = <LoadingView loading text="Checking your entries…" />;
  } else if (vm.entries.length === 0) {
    content = (
      <EmptyStateView
        icon={Icon.Scale}
        title="Every entry balances"
        subtitle="Debits and credits match in all of your posted entries."
        primaryActionLabel="Done"
        onPrimaryAction={vm.onDone}
      />
    );
  } else {
    content = (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        testID="balance-review-scroll"
      >
        <Stack space="md">
          <JournalBalanceReviewFlow
            entries={vm.entries}
            isBusy={vm.isBusy}
            copy={SAVED_ENTRY_COPY}
            testIDPrefix="balance-review"
            entryAction={openInEditor}
            onApplyFxSuggestions={vm.onApplyFxSuggestions}
            onSaveEdits={vm.onSaveEdits}
          />
        </Stack>
      </ScrollView>
    );
  }

  return (
    <ScreenWithChrome chrome={chrome} withPadding>
      {content}
    </ScreenWithChrome>
  );
}

export default withPrivacyScope(JournalBalanceReviewScreen);

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingBottom: Spacing.lg,
  },
});
