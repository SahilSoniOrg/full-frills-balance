import { AppButton, AppIcon, AppTabs, EmptyStateView, ListRow } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Size } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { Box, Stack } from '@/src/design-system';
import { HubWidget } from '@/src/features/hub/components/HubWidget';
import { useHub } from '@/src/features/hub/hooks/useHub';
import { useTheme } from '@/src/hooks/use-theme';
import { Insight } from '@/src/services/notification/NotificationService';
import { AppNavigation } from '@/src/utils/navigation';
import React, { useMemo, useState } from 'react';

type Tab = 'active' | 'dismissed';

export default function HubScreen() {
  const { strings } = AppConfig;
  const { theme } = useTheme();
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const [activeTab, setActiveTab] = useState<Tab>('active');
  const { activeInsights, dismissedInsights, unreadSmsCount, restoreInsight } = useHub(workplaceId);

  const tabOptions = useMemo(
    () => [
      {
        id: 'active' as const,
        label: strings.dashboard.hub.activeTab,
        badge: activeInsights.length + (unreadSmsCount > 0 ? 1 : 0),
      },
      {
        id: 'dismissed' as const,
        label: strings.dashboard.hub.dismissedTab,
        badge: dismissedInsights.length,
      },
    ],
    [strings, activeInsights.length, unreadSmsCount, dismissedInsights.length],
  );

  const handleRestore = async (id: string) => {
    await restoreInsight(id);
  };

  const renderSmsNotification = () => {
    if (unreadSmsCount === 0 || activeTab !== 'active') return null;

    return (
      <ListRow
        onPress={AppNavigation.toSmsInbox}
        leading={<AppIcon name="notifications" size={Size.md} color={theme.primary} />}
        title={strings.dashboard.hub.unreadSmsTitle(unreadSmsCount)}
        subtitle={strings.dashboard.hub.unreadSmsSubtitle}
        trailing={<AppIcon name="chevronRight" size={Size.sm} color={theme.textTertiary} />}
        background="surfaceSecondary"
        borderRadius="lg"
        borderWidth={1}
        borderColor="border"
        marginBottom="md"
      />
    );
  };

  return (
    <Screen title={strings.dashboard.hub.title} withPadding={false} scrollable={true}>
      <Box marginTop="md">
        <AppTabs options={tabOptions} value={activeTab} onChange={setActiveTab} />
      </Box>

      <Box padding="lg" flex={1}>
        {renderSmsNotification()}

        {activeTab === 'active' ? (
          activeInsights.length > 0 ? (
            <HubWidget
              insights={activeInsights}
              currencyCode={defaultCurrencyCode}
              hideManageDismissed
            />
          ) : unreadSmsCount === 0 ? (
            <EmptyStateView
              icon="info"
              title={strings.dashboard.hub.emptyState}
              style={{ marginTop: 60 }}
            />
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
                    onPress={() => handleRestore(item.id)}
                    style={{ borderRadius: 20 }}
                  >
                    {strings.dashboard.hub.restore}
                  </AppButton>
                }
              />
            ))}
          </Stack>
        ) : (
          <EmptyStateView
            icon="info"
            title={strings.dashboard.hub.noDismissed}
            style={{ marginTop: 60 }}
          />
        )}
      </Box>
    </Screen>
  );
}
