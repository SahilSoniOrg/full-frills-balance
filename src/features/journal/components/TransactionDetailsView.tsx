import { ScreenHeaderActions } from '@/src/components/common/ScreenHeaderActions';
import { AppButton, AppIcon, AppText, Badge } from '@/src/components/core';
import { ListRow } from '@/src/components/core/ListRow';
import { Opacity, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { TransactionDetailsViewModel } from '@/src/features/journal/hooks/useTransactionDetailsViewModel';
import React from 'react';
import { Box, Inline, Inset, Page, Stack, Separator } from '@/src/design-system';
import { NavigationBar } from '@/src/components/layout/NavigationBar';

export function TransactionDetailsView(vm: TransactionDetailsViewModel) {
    const {
        theme,
        isLoading,
        isMissing,
        title,
        backIcon,
        headerActions,
        amountText,
        amountColor,
        descriptionText,
        statusLabel,
        statusVariant,
        displayTypeLabel,
        formattedDate,
        journalIdShort,
        onHistoryPress,
        smsInfo,
        onOpenSmsInbox,
        onBack,
        splitItems,
    } = vm;

    if (isLoading) {
        return (
            <Page
                header={<NavigationBar title="Details" onBack={onBack} />}
            >
                <Box flex={1} justifyContent="center" alignItems="center">
                    <AppText variant="body">Loading...</AppText>
                </Box>
            </Page>
        );
    }

    if (isMissing) {
        return (
            <Page
                header={<NavigationBar title="Details" backIcon="close" onBack={onBack} />}
            >
                <Box flex={1} justifyContent="center" alignItems="center" padding="md">
                    <AppIcon name="error" size={Size.xxl} color={theme.textSecondary} />
                    <Box marginTop="md">
                        <AppText variant="subheading">Transaction not found</AppText>
                    </Box>
                    <Box marginTop="lg">
                        <AppButton
                            variant="ghost"
                            onPress={onBack}
                        >
                            Go Back
                        </AppButton>
                    </Box>
                </Box>
            </Page>
        );
    }

    const headerActionsNode = (
        <ScreenHeaderActions
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
                    <Box alignItems="center" marginTop="md">
                        <Box
                           background={withOpacity(amountColor, Opacity.soft)}
                           width={Size.avatarLg}
                           height={Size.avatarLg}
                           borderRadius="full"
                           alignItems="center"
                           justifyContent="center"
                        >
                            <AppIcon name={vm.displayIcon} size={Size.xxl} color={amountColor} />
                        </Box>
                    </Box>

                    <Stack space="sm" alignItems="center">
                        <AppText variant="title" style={{ fontSize: Typography.sizes.xxxl, color: vm.amountColor }}>
                            {amountText}
                        </AppText>
                        <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                            {descriptionText}
                        </AppText>
                        <Inline space="sm" marginTop="md">
                            <Badge variant={statusVariant} size="sm">
                                {statusLabel}
                            </Badge>
                            {displayTypeLabel && (
                                <Badge variant="default" size="sm">
                                    {displayTypeLabel}
                                </Badge>
                            )}
                        </Inline>
                    </Stack>

                    <Stack space="md">
                        <AppText variant="caption" color="secondary" style={{ paddingHorizontal: Spacing.md }}>
                            BREAKDOWN
                        </AppText>

                        <Stack space="xs">
                            {splitItems.map((item, index) => (
                                <React.Fragment key={item.id}>
                                    <ListRow
                                        title={item.accountName}
                                        subtitle={item.transactionType}
                                        leading={
                                            <Box
                                                background={item.iconBackground}
                                                width={Size.lg}
                                                height={Size.lg}
                                                borderRadius="full"
                                                alignItems="center"
                                                justifyContent="center"
                                            >
                                                <AppIcon
                                                    name={item.iconName as any}
                                                    fallbackIcon={item.fallbackIcon}
                                                    size={16}
                                                    color={item.iconColor}
                                                />
                                            </Box>
                                        }
                                        trailing={
                                            <Inline space="xs" alignItems="center">
                                                <AppText variant="subheading" style={{ color: item.amountColor }}>
                                                    {item.amountText}
                                                </AppText>
                                                <AppIcon name="chevronRight" size={Typography.sizes.sm} color={theme.textSecondary} />
                                            </Inline>
                                        }
                                        onPress={item.onPress}
                                        padding="md"
                                    />
                                    {index < splitItems.length - 1 && <Separator />}
                                </React.Fragment>
                            ))}
                        </Stack>
                    </Stack>

                    <Separator />

                    <Stack space="xs">
                        <ListRow
                            title="Date"
                            trailing={<AppText variant="body">{formattedDate}</AppText>}
                            padding="sm"
                        />
                        <ListRow
                            title="Journal ID"
                            trailing={<AppText variant="body">{journalIdShort}</AppText>}
                            padding="sm"
                        />
                        <ListRow
                            title="History"
                            trailing={
                                <Inline space="xs" alignItems="center">
                                    <AppText variant="body" color="primary">View Edit History</AppText>
                                    <AppIcon name="chevronRight" size={Typography.sizes.sm} color={theme.primary} />
                                </Inline>
                            }
                            onPress={onHistoryPress}
                            padding="sm"
                        />
                    </Stack>

                    {smsInfo && (
                        <Stack space="md">
                            <Separator />
                            <AppText variant="caption" color="secondary" style={{ paddingHorizontal: Spacing.md }}>
                                IMPORTED FROM SMS
                            </AppText>
                            <Stack space="xs">
                                <ListRow
                                    title="Sender"
                                    trailing={<AppText variant="body">{smsInfo.sender || '-'}</AppText>}
                                    padding="sm"
                                />
                                {smsInfo.smsDate && (
                                    <ListRow
                                        title="SMS Date"
                                        trailing={<AppText variant="body">{smsInfo.smsDate}</AppText>}
                                        padding="sm"
                                    />
                                )}
                                {smsInfo.amountText && (
                                    <ListRow
                                        title="Parsed Amount"
                                        trailing={<AppText variant="body">{smsInfo.amountText}</AppText>}
                                        padding="sm"
                                    />
                                )}
                                {smsInfo.referenceNumber && (
                                    <ListRow
                                        title="Reference"
                                        trailing={<AppText variant="body">{smsInfo.referenceNumber}</AppText>}
                                        padding="sm"
                                    />
                                )}
                                {smsInfo.accountSource && (
                                    <ListRow
                                        title="Account Source"
                                        trailing={<AppText variant="body">{smsInfo.accountSource}</AppText>}
                                        padding="sm"
                                    />
                                )}
                                {smsInfo.parseReason && (
                                    <ListRow
                                        title="Parse Note"
                                        trailing={<AppText variant="body">{smsInfo.parseReason}</AppText>}
                                        padding="sm"
                                    />
                                )}
                                {smsInfo.rawBody && (
                                    <Inset horizontal="md" vertical="sm">
                                        <AppText variant="caption" color="secondary">RAW SMS</AppText>
                                        <Box marginTop="xs">
                                            <AppText variant="body">{smsInfo.rawBody}</AppText>
                                        </Box>
                                    </Inset>
                                )}
                                {onOpenSmsInbox && (
                                    <Inset horizontal="md" top="sm">
                                        <AppButton variant="ghost" onPress={onOpenSmsInbox}>
                                            Open SMS Inbox
                                        </AppButton>
                                    </Inset>
                                )}
                            </Stack>
                        </Stack>
                    )}

                    {vm.onPost && (
                        <Stack space="sm" padding="md">
                            <AppButton
                                variant="primary"
                                onPress={vm.onPost}
                                style={{ width: '100%' }}
                            >
                                <Inline space="sm" alignItems="center">
                                    <AppIcon name="check" size={18} color={theme.onPrimary} />
                                    <AppText variant="body" weight="bold" style={{ color: theme.onPrimary }}>
                                        Post Transaction Now
                                    </AppText>
                                </Inline>
                            </AppButton>

                            {vm.onSkip && (
                                <AppButton
                                    variant="outline"
                                    onPress={vm.onSkip}
                                    style={{ width: '100%' }}
                                >
                                    <Inline space="sm" alignItems="center">
                                        <AppIcon name="close" size={18} color={theme.text} />
                                        <AppText variant="body" weight="bold">
                                            Skip This Occurrence
                                        </AppText>
                                    </Inline>
                                </AppButton>
                            )}
                        </Stack>
                    )}

                    {vm.onRevertToScheduled && (
                        <Stack space="sm" padding="md">
                            <AppButton
                                variant="outline"
                                onPress={vm.onRevertToScheduled}
                                style={{ width: '100%' }}
                            >
                                <Inline space="sm" alignItems="center">
                                    <AppIcon name="history" size={18} color={theme.primary} />
                                    <AppText variant="body" weight="bold" style={{ color: theme.primary }}>
                                        {vm.revertButtonLabel}
                                    </AppText>
                                </Inline>
                            </AppButton>
                        </Stack>
                    )}
                </Stack>
            </Inset>
        </Page>
    );
}

// No styles needed as we use design system primitives
