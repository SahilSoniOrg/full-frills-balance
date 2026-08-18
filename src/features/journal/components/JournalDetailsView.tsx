import { EmptyStateView } from '@/src/components/common/EmptyStateView';
import { LoadingView } from '@/src/components/common/LoadingView';
import { AppText } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Inset, Separator, Stack } from '@/src/design-system';
import { JournalDetailsViewModel } from '@/src/features/journal/hooks/useJournalDetailsViewModel';
import React from 'react';
import { JournalDetailsActions } from './details/JournalDetailsActions';
import { JournalBreakdownList } from './details/JournalBreakdownList';
import { JournalDetailsHero } from './details/JournalDetailsHero';
import { JournalDetailsMetadata } from './details/JournalDetailsMetadata';
import { JournalDetailsSmsSection } from './details/JournalDetailsSmsSection';

type ScreenState =
  { type: 'loading' } | { type: 'missing' } | { type: 'ready'; data: JournalDetailsViewModel };

export function JournalDetailsView({
  chrome,
  ...vm
}: JournalDetailsViewModel & { chrome: ScreenNavChrome }) {
  const { isLoading, isMissing, onBack } = vm;

  const state: ScreenState = React.useMemo(() => {
    if (isLoading) return { type: 'loading' };
    if (isMissing) return { type: 'missing' };
    return { type: 'ready', data: vm };
  }, [isLoading, isMissing, vm]);

  let body: React.ReactNode;
  switch (state.type) {
    case 'loading':
      body = <LoadingView loading={true} />;
      break;
    case 'missing':
      body = (
        <EmptyStateView
          title="Transaction not found"
          icon="error"
          primaryActionLabel="Go Back"
          onPrimaryAction={onBack}
        />
      );
      break;
    case 'ready': {
      const readyVm = state.data;
      body = (
        <Inset space="md" vertical="md">
          <Stack space="xl">
            <JournalDetailsHero
              displayIcon={readyVm.displayIcon}
              amountColor={readyVm.amountColor}
              amount={readyVm.amount}
              currencyCode={readyVm.currencyCode}
              amountPrefix={readyVm.amountPrefix}
              descriptionText={readyVm.descriptionText}
              statusLabel={readyVm.statusLabel}
              statusVariant={readyVm.statusVariant}
              displayTypeLabel={readyVm.displayTypeLabel}
            />

            <Separator />

            <JournalBreakdownList splitItems={readyVm.splitItems} />

            <Separator />

            <JournalDetailsMetadata
              formattedDate={readyVm.formattedDate}
              notesText={readyVm.notesText}
              onHistoryPress={readyVm.onHistoryPress}
            />

            {readyVm.smsInfo && (
              <>
                <Separator />
                <JournalDetailsSmsSection
                  smsInfo={readyVm.smsInfo}
                  onOpenSmsInbox={readyVm.onOpenSmsInbox}
                />
              </>
            )}

            {readyVm.statusNotice && (
              <AppText variant="caption" color="warning">
                {readyVm.statusNotice}
              </AppText>
            )}

            <JournalDetailsActions
              onPost={readyVm.onPost}
              onSkip={readyVm.onSkip}
              onRevertToScheduled={readyVm.onRevertToScheduled}
              revertButtonLabel={readyVm.revertButtonLabel}
            />
          </Stack>
        </Inset>
      );
      break;
    }
  }

  return (
    <ScreenWithChrome chrome={chrome} scrollable={state.type === 'ready'}>
      {body}
    </ScreenWithChrome>
  );
}
