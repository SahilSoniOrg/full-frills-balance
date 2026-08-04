import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { AppButton, AppIcon, AppTabs, EmptyStateView, ListRow } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Size } from '@/src/constants';
import { Box, Stack } from '@/src/design-system';
import { HubWidget } from '@/src/features/hub/components/HubWidget';
import type { HubViewModel } from '@/src/features/hub/hooks/useHubViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { Insight } from '@/src/services/insight/InsightService';
import { AppNavigation } from '@/src/utils/navigation';

export function HubView({
  title,
  activeTab,
  setActiveTab,
  tabOptions,
  activeInsights,
  dismissedInsights,
  unreadSmsCount,
  currencyCode,
  isPrivacyMode,
  strings,
  dismissInsight,
  restoreInsight,
}: HubViewModel) {
  const { theme } = useTheme();

  return (
    <Screen
      title={title}
      withPadding={false}
      scrollable={true}
      headerActions={<PrivacyToggleButton />}
    >
      <Box marginTop="md">
        <AppTabs options={tabOptions} value={activeTab} onChange={setActiveTab} />
      </Box>

      <Box padding="lg" flex={1}>
        {unreadSmsCount > 0 && activeTab === 'active' ? (
          <ListRow
            onPress={AppNavigation.toTransactionInbox}
            leading={<AppIcon name="notifications" size={Size.md} color={theme.primary} />}
            title={strings.unreadSmsTitle(unreadSmsCount)}
            subtitle={strings.unreadSmsSubtitle}
            trailing={<AppIcon name="chevronRight" size={Size.sm} color={theme.textTertiary} />}
            background="surfaceSecondary"
            borderRadius="lg"
            borderWidth={1}
            borderColor="border"
            marginBottom="md"
          />
        ) : null}

        {activeTab === 'active' ? (
          activeInsights.length > 0 ? (
            <HubWidget
              insights={activeInsights}
              currencyCode={currencyCode}
              onDismiss={dismissInsight}
              hideManageDismissed
              isPrivacyMode={isPrivacyMode}
            />
          ) : unreadSmsCount === 0 ? (
            <EmptyStateView icon="info" title={strings.emptyState} style={{ marginTop: 60 }} />
          ) : null
        ) : dismissedInsights.length > 0 ? (
          <Stack gap="sm">
            {dismissedInsights.map((item: Insight) => (
              <ListRow
                key={item.id}
                background="surface"
                borderRadius="lg"
                borderWidth={1}
                borderColor="border"
                leading={
                  <AppIcon
                    name={item.type === 'subscription-amnesiac' ? 'history' : 'trendingUp'}
                    size={Size.xs}
                    color={theme.text}
                  />
                }
                title={item.message}
                subtitle={item.description}
                trailing={
                  <AppButton
                    size="sm"
                    onPress={() => restoreInsight(item.id)}
                    style={{ borderRadius: 20 }}
                  >
                    {strings.restore}
                  </AppButton>
                }
              />
            ))}
          </Stack>
        ) : (
          <EmptyStateView icon="info" title={strings.noDismissed} style={{ marginTop: 60 }} />
        )}
      </Box>
    </Screen>
  );
}
