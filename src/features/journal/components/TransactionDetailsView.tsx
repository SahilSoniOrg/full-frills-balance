import { EmptyStateView } from '@/src/components/common/EmptyStateView';
import { LoadingView } from '@/src/components/common/LoadingView';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Inset, Separator, Stack } from '@/src/design-system';
import { TransactionDetailsViewModel } from '@/src/features/journal/hooks/useTransactionDetailsViewModel';
import React from 'react';
import { TransactionActions } from './details/TransactionActions';
import { TransactionBreakdownList } from './details/TransactionBreakdownList';
import { TransactionHero } from './details/TransactionHero';
import { TransactionMetadata } from './details/TransactionMetadata';
import { TransactionSMSDetails } from './details/TransactionSMSDetails';

type ScreenState =
  { type: 'loading' } | { type: 'missing' } | { type: 'ready'; data: TransactionDetailsViewModel };

export function TransactionDetailsView({
  chrome,
  ...vm
}: TransactionDetailsViewModel & { chrome: ScreenNavChrome }) {
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
            <TransactionHero
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

            <TransactionBreakdownList splitItems={readyVm.splitItems} />

            <Separator />

            <TransactionMetadata
              formattedDate={readyVm.formattedDate}
              notesText={readyVm.notesText}
              onHistoryPress={readyVm.onHistoryPress}
            />

            {readyVm.smsInfo && (
              <>
                <Separator />
                <TransactionSMSDetails
                  smsInfo={readyVm.smsInfo}
                  onOpenSmsInbox={readyVm.onOpenSmsInbox}
                />
              </>
            )}

            <TransactionActions
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
    <ScreenWithChrome chrome={chrome} onBack={onBack} scrollable={state.type === 'ready'}>
      {body}
    </ScreenWithChrome>
  );
}
