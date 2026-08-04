import { EmptyStateView } from '@/src/components/common/EmptyStateView';
import { LoadingView } from '@/src/components/common/LoadingView';
import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { ScreenHeaderActions } from '@/src/components/common/ScreenHeaderActions';
import { NavigationBar } from '@/src/components/layout/NavigationBar';
import { Typography } from '@/src/constants';
import { Inset, Page, Separator, Stack } from '@/src/design-system';
import { TransactionDetailsViewModel } from '@/src/features/journal/hooks/useTransactionDetailsViewModel';
import React from 'react';
import { TransactionActions } from './details/TransactionActions';
import { TransactionBreakdownList } from './details/TransactionBreakdownList';
import { TransactionHero } from './details/TransactionHero';
import { TransactionMetadata } from './details/TransactionMetadata';
import { TransactionSMSDetails } from './details/TransactionSMSDetails';

type ScreenState =
  { type: 'loading' } | { type: 'missing' } | { type: 'ready'; data: TransactionDetailsViewModel };

export function TransactionDetailsView(vm: TransactionDetailsViewModel) {
  const { isLoading, isMissing, theme, onBack } = vm;

  const state: ScreenState = React.useMemo(() => {
    if (isLoading) return { type: 'loading' };
    if (isMissing) return { type: 'missing' };
    return { type: 'ready', data: vm };
  }, [isLoading, isMissing, vm]);

  switch (state.type) {
    case 'loading':
      return (
        <Page header={<NavigationBar title="Details" onBack={onBack} />}>
          <LoadingView loading={true} />
        </Page>
      );

    case 'missing':
      return (
        <Page header={<NavigationBar title="Details" backIcon="close" onBack={onBack} />}>
          <EmptyStateView
            title="Transaction not found"
            icon="error"
            primaryActionLabel="Go Back"
            onPrimaryAction={onBack}
          />
        </Page>
      );

    case 'ready': {
      const readyVm = state.data;
      const {
        title,
        backIcon,
        headerActions,
        amount,
        currencyCode,
        amountPrefix,
        amountColor,
        descriptionText,
        statusLabel,
        statusVariant,
        displayTypeLabel,
        formattedDate,
        onHistoryPress,
        smsInfo,
        onOpenSmsInbox,
        splitItems,
        displayIcon,
        onPost,
        onSkip,
        onRevertToScheduled,
        revertButtonLabel,
      } = readyVm;

      const headerActionsNode = (
        <ScreenHeaderActions
          leading={<PrivacyToggleButton variant="clear" size={Typography.sizes.xl} />}
          actions={[
            {
              name: 'copy',
              onPress: headerActions.onCopy,
              iconColor: theme.text,
              size: Typography.sizes.xl,
              testID: 'copy-button',
            },
            {
              name: 'edit',
              onPress: headerActions.onEdit,
              iconColor: theme.text,
              size: Typography.sizes.xl,
              testID: 'edit-button',
            },
            {
              name: 'delete',
              onPress: headerActions.onDelete,
              iconColor: theme.error,
              size: Typography.sizes.xl,
              testID: 'delete-button',
            },
          ]}
        />
      );

      return (
        <Page
          scrollable
          header={
            <NavigationBar
              title={title}
              backIcon={backIcon}
              rightActions={headerActionsNode}
              onBack={onBack}
            />
          }
        >
          <Inset space="md" vertical="md">
            <Stack space="xl">
              <TransactionHero
                displayIcon={displayIcon}
                amountColor={amountColor}
                amount={amount}
                currencyCode={currencyCode}
                amountPrefix={amountPrefix}
                descriptionText={descriptionText}
                statusLabel={statusLabel}
                statusVariant={statusVariant}
                displayTypeLabel={displayTypeLabel}
              />

              <Separator />

              <TransactionBreakdownList splitItems={splitItems} />

              <Separator />

              <TransactionMetadata
                formattedDate={formattedDate}
                notesText={readyVm.notesText}
                onHistoryPress={onHistoryPress}
              />

              {smsInfo && (
                <>
                  <Separator />
                  <TransactionSMSDetails smsInfo={smsInfo} onOpenSmsInbox={onOpenSmsInbox} />
                </>
              )}

              <TransactionActions
                onPost={onPost}
                onSkip={onSkip}
                onRevertToScheduled={onRevertToScheduled}
                revertButtonLabel={revertButtonLabel}
              />
            </Stack>
          </Inset>
        </Page>
      );
    }
  }
}
