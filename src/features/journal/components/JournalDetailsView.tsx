import { EmptyStateView } from '@/src/components/shared/EmptyStateView';
import { LoadingView } from '@/src/components/shared/LoadingView';
import { Icon, AppText } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Box, Separator, Stack } from '@/src/design-system';
import { JournalDetailsViewModel } from '@/src/features/journal/hooks/useJournalDetailsViewModel';
import { JournalDetailsActions } from './details/JournalDetailsActions';
import { JournalBreakdownList } from './details/JournalBreakdownList';
import { JournalDetailsHero } from './details/JournalDetailsHero';
import { JournalDetailsMetadata } from './details/JournalDetailsMetadata';
import { JournalDetailsSmsSection } from './details/JournalDetailsSmsSection';

export function JournalDetailsView({
  chrome,
  ...vm
}: JournalDetailsViewModel & { chrome: ScreenNavChrome }) {
  const { isLoading, isMissing, onBack } = vm;

  if (isLoading) {
    return (
      <ScreenWithChrome chrome={chrome} scrollable={false}>
        <LoadingView loading={true} />
      </ScreenWithChrome>
    );
  }

  if (isMissing) {
    return (
      <ScreenWithChrome chrome={chrome} scrollable={false}>
        <EmptyStateView
          title="Transaction not found"
          icon={Icon.Error}
          primaryActionLabel="Go Back"
          onPrimaryAction={onBack}
        />
      </ScreenWithChrome>
    );
  }

  return (
    <ScreenWithChrome chrome={chrome} scrollable>
      <Box padding="md" paddingVertical="md">
        <Stack space="xl">
          <JournalDetailsHero
            displayIcon={vm.displayIcon}
            amountColor={vm.amountColor}
            amount={vm.amount}
            currencyCode={vm.currencyCode}
            amountPrefix={vm.amountPrefix}
            descriptionText={vm.descriptionText}
            statusLabel={vm.statusLabel}
            statusVariant={vm.statusVariant}
            displayTypeLabel={vm.displayTypeLabel}
          />

          <Separator />

          <JournalBreakdownList splitItems={vm.splitItems} />

          <Separator />

          <JournalDetailsMetadata
            formattedDate={vm.formattedDate}
            notesText={vm.notesText}
            onHistoryPress={vm.onHistoryPress}
          />

          {vm.smsInfo?.length ? (
            <>
              <Separator />
              <JournalDetailsSmsSection smsInfo={vm.smsInfo} onOpenSmsInbox={vm.onOpenSmsInbox} />
            </>
          ) : null}

          {vm.statusNotice && (
            <AppText variant="caption" color="warning">
              {vm.statusNotice}
            </AppText>
          )}

          <JournalDetailsActions
            onPost={vm.onPost}
            onSkip={vm.onSkip}
            onRevertToScheduled={vm.onRevertToScheduled}
            revertButtonLabel={vm.revertButtonLabel}
          />
        </Stack>
      </Box>
    </ScreenWithChrome>
  );
}
