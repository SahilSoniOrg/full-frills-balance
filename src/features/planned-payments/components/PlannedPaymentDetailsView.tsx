import { MoneyText } from '@/src/components/common/MoneyText';
import { SelectionActionBar } from '@/src/components/common/SelectionActionBar';
import { AppButton, AppIcon, AppSurface, Badge, IconName, IvyIcon } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { Box, Column, Row, Text } from '@/src/design-system';
import { PlannedPaymentHistoryCard } from '@/src/features/planned-payments/components/PlannedPaymentHistoryCard';
import { getPlannedPaymentHistoryPresentation } from '@/src/features/planned-payments/hooks/plannedPaymentDetailsPresentation';
import { PlannedPaymentDetailsViewModel } from '@/src/features/planned-payments/hooks/usePlannedPaymentDetailsViewModel';
import { JournalListModals } from '@/src/features/journal';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { getNow } from '@/src/utils/dateHelpers';

export function PlannedPaymentDetailsView({
  chrome,
  ...vm
}: PlannedPaymentDetailsViewModel & { chrome: ScreenNavChrome }) {
  const {
    theme,
    isLoading,
    isMissing,
    onBack,
    amount,
    currencyCode,
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
    onPost,
    onSkip,
    onToggleStatus,
    selectedIds,
    isSelectionModeActive,
    onLongPressItem,
    toggleSelection,
    selectAll,
    clearItems,
    exitSelectionMode,
    onShareSelected,
    actions,
    modals,
  } = vm;

  const accentColor = theme[typeColorKey as keyof typeof theme] as string;

  return (
    <ScreenWithChrome
      chrome={chrome}
      scrollable={!isLoading && !isMissing}
      withPadding={!isLoading && !isMissing}
      footer={
        <SelectionActionBar
          isVisible={isSelectionModeActive}
          selectedCount={selectedIds.size}
          totalCount={history?.length ?? 0}
          onSelectAll={selectAll}
          onDeselectAll={clearItems}
          onClear={exitSelectionMode}
          onShare={onShareSelected}
          actions={actions}
        />
      }
    >
      {isLoading ? (
        <Column flex={1} align="center" justify="center">
          <Text variant="base">{AppConfig.strings.common.loading}</Text>
        </Column>
      ) : isMissing ? (
        <Column flex={1} align="center" justify="center" gap="md">
          <AppIcon name="error" size={Size.xxl} color={theme.textSecondary} />
          <Text variant="subheading">Planned Payment not found</Text>
          <AppButton variant="ghost" onPress={onBack} style={{ marginTop: Spacing.lg }}>
            Go Back
          </AppButton>
        </Column>
      ) : (
        <>
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
                  {amount != null && currencyCode ? (
                    <MoneyText
                      amount={amount}
                      currencyCode={currencyCode}
                      variant="xl"
                      weight="bold"
                    />
                  ) : (
                    <Text variant="xxl" weight="bold">
                      ...
                    </Text>
                  )}
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
                  const presentation = getPlannedPaymentHistoryPresentation(journal, getNow());
                  const isSelected = selectedIds.has(journal.id);

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
                      presentation={presentation}
                      isOverdue={presentation.isOverdue}
                      isSelected={isSelected}
                      isSelectionModeActive={isSelectionModeActive}
                      onLongPress={() => onLongPressItem(journal.id)}
                      onPress={() =>
                        isSelectionModeActive
                          ? toggleSelection(journal.id)
                          : vm.onOpenJournal(journal.id)
                      }
                    />
                  );
                })}
              </Column>
            )}
          </Column>

          {modals ? <JournalListModals {...modals} /> : null}
        </>
      )}
    </ScreenWithChrome>
  );
}
