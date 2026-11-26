import {
  Icon,
  AppButton,
  AppIcon,
  AppTabs,
  EmptyStateView,
  ErrorStateView,
  ListGroup,
  ListRow,
  LoadingView,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { Box } from '@/src/design-system';
import { HubWidget } from '@/src/features/hub/components/HubWidget';
import { insightTypePresentation } from '@/src/features/hub/helpers/insightTypePresentation';
import type { HubViewModel } from '@/src/features/hub/hooks/useHubViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import type { Insight } from '@/src/services/insight/insightTypes';
import { StyleSheet } from 'react-native';

function HubActiveContent({
  activeInsights,
  isInsightsLoading,
  insightsError,
  retryInsights,
  unreadSmsCount,
  currencyCode,
  emptyStateTitle,
  dismissInsight,
  onOpenInsight,
  onCreateEmergencyAccount,
}: {
  activeInsights: Insight[];
  isInsightsLoading: boolean;
  insightsError?: Error | null;
  retryInsights?: () => void;
  unreadSmsCount: number;
  currencyCode: string;
  emptyStateTitle: string;
  dismissInsight: (id: string) => void;
  onOpenInsight: (insight: Insight) => void;
  onCreateEmergencyAccount: () => void;
}) {
  if (activeInsights.length > 0) {
    return (
      <HubWidget
        insights={activeInsights}
        currencyCode={currencyCode}
        onDismiss={dismissInsight}
        onOpenInsight={onOpenInsight}
        onCreateEmergencyAccount={onCreateEmergencyAccount}
        hideManageDismissed
      />
    );
  }
  if (isInsightsLoading) {
    return <LoadingView loading variant="inline" text={AppConfig.strings.common.loading} />;
  }
  if (insightsError) {
    return (
      <ErrorStateView variant="inline" message={insightsError.message} onRetry={retryInsights} />
    );
  }
  if (unreadSmsCount === 0) {
    return <EmptyStateView icon={Icon.Info} title={emptyStateTitle} style={styles.emptyState} />;
  }
  return null;
}

function HubDismissedContent({
  dismissedInsights,
  isInsightsLoading,
  insightsError,
  retryInsights,
  noDismissedTitle,
  restoreLabel,
  restoreInsight,
}: {
  dismissedInsights: Insight[];
  isInsightsLoading: boolean;
  insightsError?: Error | null;
  retryInsights?: () => void;
  noDismissedTitle: string;
  restoreLabel: string;
  restoreInsight: (id: string) => void;
}) {
  const { theme } = useTheme();

  if (dismissedInsights.length > 0) {
    return (
      <ListGroup
        items={dismissedInsights}
        toRow={(item: Insight) => ({
          id: item.id,
          leading: (
            <AppIcon
              name={insightTypePresentation(item.type).icon}
              size={Size.xs}
              color={theme.text}
            />
          ),
          title: item.message,
          subtitle: item.description,
          trailing: (
            <AppButton
              size="sm"
              onPress={() => restoreInsight(item.id)}
              style={styles.restoreButton}
            >
              {restoreLabel}
            </AppButton>
          ),
        })}
      />
    );
  }
  if (isInsightsLoading) {
    return <LoadingView loading variant="inline" text={AppConfig.strings.common.loading} />;
  }
  if (insightsError) {
    return (
      <ErrorStateView variant="inline" message={insightsError.message} onRetry={retryInsights} />
    );
  }
  return <EmptyStateView icon={Icon.Info} title={noDismissedTitle} style={styles.emptyState} />;
}

export function HubView({
  activeTab,
  setActiveTab,
  tabOptions,
  activeInsights,
  dismissedInsights,
  isInsightsLoading,
  insightsError,
  retryInsights,
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
              />
            </ListGroup>
          </Box>
        ) : null}

        {activeTab === 'active' ? (
          <HubActiveContent
            activeInsights={activeInsights}
            isInsightsLoading={isInsightsLoading}
            insightsError={insightsError}
            retryInsights={retryInsights}
            unreadSmsCount={unreadSmsCount}
            currencyCode={currencyCode}
            emptyStateTitle={strings.emptyState}
            dismissInsight={dismissInsight}
            onOpenInsight={onOpenInsight}
            onCreateEmergencyAccount={onCreateEmergencyAccount}
          />
        ) : (
          <HubDismissedContent
            dismissedInsights={dismissedInsights}
            isInsightsLoading={isInsightsLoading}
            insightsError={insightsError}
            retryInsights={retryInsights}
            noDismissedTitle={strings.noDismissed}
            restoreLabel={strings.restore}
            restoreInsight={restoreInsight}
          />
        )}
      </Box>
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    marginTop: Spacing.xxxl,
  },
  restoreButton: {
    borderRadius: Shape.radius.xl,
  },
});
