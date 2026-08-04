import { getNow } from '@/src/utils/dateHelpers';
import { ScreenHeaderActions } from '@/src/components/common/ScreenHeaderActions';
import { AppButton, AppIcon, AppSurface, Badge, IconName, IvyIcon } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Size, Spacing, Typography } from '@/src/constants';
import { Box, Column, Row, Text } from '@/src/design-system';
import { PlannedPaymentHistoryCard } from '@/src/features/planned-payments/components/PlannedPaymentHistoryCard';
import { PlannedPaymentDetailsViewModel } from '@/src/features/planned-payments/hooks/usePlannedPaymentDetailsViewModel';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { AppNavigation } from '@/src/utils/navigation';

export function PlannedPaymentDetailsView(vm: PlannedPaymentDetailsViewModel) {
  const {
    theme,
    isLoading,
    isMissing,
    onBack,
    title,
    amountText,
    nameText,
    statusLabel,
    statusVariant,
    typeLabel,
    typeColorKey,
    iconName,
    intervalLabel,
    nextOccurrenceText,
    isAutoPost,
    fromAccount,
    toAccount,
    fromAccountColorKey,
    toAccountColorKey,
    history,
    headerActions,
    onPost,
    onSkip,
    onToggleStatus,
  } = vm;

  if (isLoading) {
    return (
      <Screen title="Details">
        <Column flex={1} align="center" justify="center">
          <Text variant="base">{AppConfig.strings.common.loading}</Text>
        </Column>
      </Screen>
    );
  }

  if (isMissing) {
    return (
      <Screen title="Details">
        <Column flex={1} align="center" justify="center" gap="md">
          <AppIcon name="error" size={Size.xxl} color={theme.textSecondary} />
          <Text variant="subheading">Planned Payment not found</Text>
          <AppButton variant="ghost" onPress={onBack} style={{ marginTop: Spacing.lg }}>
            Go Back
          </AppButton>
        </Column>
      </Screen>
    );
  }

  const headerActionsNode = (
    <ScreenHeaderActions
      actions={[
        {
          name: 'edit',
          onPress: headerActions?.onEdit,
          iconColor: theme.text,
          size: Typography.sizes.xl,
          testID: 'edit-button',
        },
        {
          name: 'delete',
          onPress: headerActions?.onDelete,
          iconColor: theme.error,
          size: Typography.sizes.xl,
          testID: 'delete-button',
        },
      ]}
    />
  );

  const accentColor = theme[typeColorKey as keyof typeof theme] as string;

  return (
    <Screen title={title} showBack={true} headerActions={headerActionsNode} scrollable withPadding>
      <Column paddingVertical="lg">
        <AppSurface
          elevation="sm"
          padding="lg"
          radius="r2"
          background="surface"
          borderWidth={1}
          borderColor="surfaceSecondary"
          style={{ marginBottom: Spacing.lg }}
        >
          <Row align="center" gap="md" marginBottom="lg">
            <Box
              width={Size.avatarLg}
              height={Size.avatarLg}
              borderRadius="full"
              alignItems="center"
              justifyContent="center"
              background={typeColorKey}
              backgroundOpacity="soft"
            >
              <AppIcon name={iconName as IconName} size={32} color={accentColor} />
            </Box>
            <Column flex={1} justify="center">
              <Text variant="xl" weight="bold" marginBottom="xs">
                {nameText}
              </Text>
              <Row gap="xs" align="center" flexWrap="wrap">
                <Badge variant={statusVariant} size="sm">
                  {statusLabel}
                </Badge>
                <Badge variant="default" size="sm">
                  {typeLabel}
                </Badge>
                {isAutoPost && (
                  <Badge variant="success" size="sm">
                    AUTO-POST
                  </Badge>
                )}
              </Row>
            </Column>
          </Row>

          <Row gap="lg" marginBottom="lg">
            <Column flex={1}>
              <Text variant="xs" color="secondary" weight="bold" opacity={0.6} marginBottom={4}>
                AMOUNT NEXT
              </Text>
              <Text variant="xxl" weight="bold">
                {amountText}
              </Text>
            </Column>
            <Column flex={1}>
              <Text variant="xs" color="secondary" weight="bold" opacity={0.6} marginBottom={4}>
                DATE NEXT
              </Text>
              <Text variant="base" weight="bold">
                {nextOccurrenceText}
              </Text>
            </Column>
          </Row>

          <Row paddingVertical="sm" paddingTop={0}>
            <Column flex={1}>
              <Text variant="xs" color="secondary" weight="bold" opacity={0.6} marginBottom={4}>
                RECURRENCE
              </Text>
              <Text variant="base" weight="semibold">
                {intervalLabel}
              </Text>
            </Column>
          </Row>

          <Box height={1} background="divider" marginVertical="md" />

          <Column>
            <Text variant="xs" color="secondary" weight="bold" opacity={0.6} marginBottom="md">
              ACCOUNT FLOW
            </Text>
            <Column gap="sm">
              <Row align="center" gap="md">
                <IvyIcon
                  name={fromAccount?.icon}
                  fallbackIcon={getAccountFallbackIcon(fromAccount?.accountType)}
                  label={fromAccount?.name}
                  color={theme[fromAccountColorKey as keyof typeof theme] as string}
                  size={Size.avatarSm}
                  shape="circle"
                />
                <Text variant="base" weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {fromAccount?.name || AppConfig.strings.common.loading}
                </Text>
              </Row>

              <Row align="center" paddingLeft="xs" marginVertical={-2}>
                <AppIcon name="arrowDown" size={14} color={theme.textTertiary} />
              </Row>

              <Row align="center" gap="md">
                <IvyIcon
                  name={toAccount?.icon}
                  fallbackIcon={getAccountFallbackIcon(toAccount?.accountType)}
                  label={toAccount?.name}
                  color={theme[toAccountColorKey as keyof typeof theme] as string}
                  size={Size.avatarSm}
                  shape="circle"
                />
                <Text variant="base" weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {toAccount?.name || AppConfig.strings.common.loading}
                </Text>
              </Row>
            </Column>
          </Column>
        </AppSurface>
        <Column marginBottom="xl" paddingHorizontal="sm">
          <AppButton
            variant="primary"
            onPress={onPost}
            style={{ width: '100%', marginBottom: Spacing.md }}
          >
            <Row align="center" justify="center" gap="sm">
              <AppIcon name="check" size={18} color={theme.onPrimary} />
              <Text variant="base" weight="bold" style={{ color: theme.onPrimary }}>
                Post Next Occurrence
              </Text>
            </Row>
          </AppButton>

          <Row gap="md">
            <AppButton variant="outline" onPress={onSkip} style={{ flex: 1 }}>
              <Row align="center" justify="center" gap="sm">
                <AppIcon name="close" size={18} color={theme.text} />
                <Text variant="base" weight="bold">
                  Skip Next
                </Text>
              </Row>
            </AppButton>

            <AppButton variant="secondary" onPress={onToggleStatus} style={{ flex: 1 }}>
              <Row align="center" justify="center" gap="sm">
                <AppIcon
                  name={statusLabel === 'ACTIVE' ? 'pause' : 'play'}
                  size={16}
                  color={theme.text}
                />
                <Text variant="base" weight="semibold">
                  {statusLabel === 'ACTIVE' ? 'Pause' : 'Resume'}
                </Text>
              </Row>
            </AppButton>
          </Row>
        </Column>

        <Box marginHorizontal="sm" marginBottom="lg" marginTop="lg">
          <Text variant="heading" weight="bold" color="secondary">
            History
          </Text>
        </Box>
        {history?.length === 0 ? (
          <AppSurface
            elevation="none"
            padding="lg"
            radius="r2"
            marginBottom="lg"
            background="surface"
            borderWidth={1}
            borderColor="border"
            style={{
              borderStyle: 'dashed',
            }}
          >
            <Text color="secondary" align="center">
              No transactions generated yet.
            </Text>
          </AppSurface>
        ) : (
          <Column marginBottom="lg">
            {history?.map(journal => {
              const dateValue = new Date(journal.journalDate).setHours(0, 0, 0, 0);
              const today = new Date(getNow()).setHours(0, 0, 0, 0);
              const tomorrow = new Date(getNow() + 86400000).setHours(0, 0, 0, 0);

              const isOverdue = journal.status === 'PLANNED' && dateValue < today;
              const isDueSoon =
                journal.status === 'PLANNED' && (dateValue === today || dateValue === tomorrow);

              let label = 'Posted';
              if (journal.status === 'PLANNED') {
                if (dateValue === today) label = 'Due Today';
                else if (dateValue === tomorrow) label = 'Due Tomorrow';
                else label = 'Scheduled';
              } else if (journal.status === 'SKIPPED') {
                label = 'Skipped';
              } else if (journal.status === 'PAUSED') {
                label = 'Paused';
              }

              let typeColor = 'textSecondary';
              if (journal.status === 'PLANNED') {
                if (isOverdue) typeColor = 'error';
                else if (isDueSoon) typeColor = 'warning';
                else typeColor = 'textSecondary';
              } else if (journal.status === 'SKIPPED' || journal.status === 'PAUSED') {
                typeColor = 'textSecondary';
              } else {
                typeColor =
                  journal.displayType === 'INCOME'
                    ? 'income'
                    : journal.displayType === 'EXPENSE'
                      ? 'expense'
                      : 'transfer';
              }

              return (
                <PlannedPaymentHistoryCard
                  key={journal.id}
                  journalId={journal.id}
                  journalTitle={journal.description || 'Transaction'}
                  journalAmount={journal.totalAmount}
                  currencyCode={journal.currencyCode}
                  journalDate={journal.journalDate}
                  plannedAmount={vm.rawAmount ?? 0}
                  plannedTitle={vm.rawName ?? ''}
                  presentation={{
                    label,
                    typeIcon:
                      journal.displayType === 'INCOME'
                        ? 'arrowUp'
                        : journal.displayType === 'EXPENSE'
                          ? 'arrowDown'
                          : 'swapHorizontal',
                    typeColor,
                  }}
                  isOverdue={isOverdue}
                  onPress={() => AppNavigation.toTransactionDetails(journal.id)}
                />
              );
            })}
          </Column>
        )}
      </Column>
    </Screen>
  );
}
