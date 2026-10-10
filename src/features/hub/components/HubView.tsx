import {
  Icon,
  AppButton,
  AppIcon,
  AppTabs,
  EmptyStateView,
  ListGroup,
  ListRow,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Size, Spacing } from '@/src/constants';
import { Box } from '@/src/design-system';
import { HubWidget } from '@/src/features/hub/components/HubWidget';
import { insightTypePresentation } from '@/src/features/hub/helpers/insightTypePresentation';
import type { HubViewModel } from '@/src/features/hub/hooks/useHubViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import type { Insight } from '@/src/services/insight/insightTypes';

export function HubView({
  activeTab,
  setActiveTab,
  tabOptions,
  activeInsights,
  dismissedInsights,
  unreadSmsCount,
  currencyCode,
  strings,
  dismissInsight,
  restoreInsight,
  onOpenInbox,
  onOpenInsight,
  onCreateEmergencyAccount,
  chrome,
}: HubViewModel & { chrome: ScreenNavChrome }) {
  const { theme } = useTheme();

  return (
    <ScreenWithChrome chrome={chrome} withPadding={false} scrollable>
      <Box marginTop="md">
        <AppTabs options={tabOptions} value={activeTab} onChange={setActiveTab} />
      </Box>

      <Box padding="lg" flex={1}>
        {unreadSmsCount > 0 && activeTab === 'active' ? (
          <Box marginBottom="md">
            <ListGroup>
              <ListRow
                onPress={onOpenInbox}
                icon={Icon.Notifications}
                title={strings.unreadSmsTitle(unreadSmsCount)}
                subtitle={strings.unreadSmsSubtitle}
                chevron
              />
            </ListGroup>
          </Box>
        ) : null}

        {activeTab === 'active' ? (
          activeInsights.length > 0 ? (
            <HubWidget
              insights={activeInsights}
              currencyCode={currencyCode}
              onDismiss={dismissInsight}
              onOpenInsight={onOpenInsight}
              onCreateEmergencyAccount={onCreateEmergencyAccount}
              hideManageDismissed
            />
          ) : unreadSmsCount === 0 ? (
            <EmptyStateView
              icon={Icon.Info}
              title={strings.emptyState}
              style={{ marginTop: Spacing.xxxl }}
            />
          ) : null
        ) : dismissedInsights.length > 0 ? (
          <ListGroup>
            {dismissedInsights.map((item: Insight) => (
              <ListRow
                key={item.id}
                leading={
                  <AppIcon
                    name={insightTypePresentation(item.type).icon}
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
          </ListGroup>
        ) : (
          <EmptyStateView
            icon={Icon.Info}
            title={strings.noDismissed}
            style={{ marginTop: Spacing.xxxl }}
          />
        )}
      </Box>
    </ScreenWithChrome>
  );
}
