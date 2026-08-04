import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { AppTabs, FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Box, Stack } from '@/src/design-system';
import { BudgetsTabPanel } from '@/src/features/commitments/components/BudgetsTabPanel';
import { PlannedTabPanel } from '@/src/features/commitments/components/PlannedTabPanel';
import type { CommitmentsViewModel } from '@/src/features/commitments/hooks/useCommitmentsViewModel';

export function CommitmentsView({
  activeTab,
  setActiveTab,
  tabOptions,
  subtitle,
  fab,
}: CommitmentsViewModel) {
  return (
    <Screen
      title="Commitments"
      showBack={false}
      scrollable={false}
      headerActions={<PrivacyToggleButton />}
    >
      <Stack gap="lg">
        <Box marginTop="md">
          <AppTabs
            testID="commitments-tabs"
            options={tabOptions}
            value={activeTab}
            onChange={setActiveTab}
          />
        </Box>
        <Box paddingHorizontal="lg">
          <ScreenSectionHeader subtitle={subtitle} />
        </Box>
      </Stack>

      <Box flex={1} marginTop="md">
        {activeTab === 'budgets' ? <BudgetsTabPanel /> : <PlannedTabPanel />}
      </Box>

      <FloatingActionButton
        onPress={fab.onPress}
        label={fab.label}
        placement="end"
        accessibilityLabel={fab.accessibilityLabel}
      />
    </Screen>
  );
}
