import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { Box, Stack } from '@/src/design-system';
import { BudgetsTabPanel } from '@/src/features/commitments/components/BudgetsTabPanel';
import { PlannedTabPanel } from '@/src/features/commitments/components/PlannedTabPanel';
import type { CommitmentsViewModel } from '@/src/features/commitments/hooks/useCommitmentsViewModel';
import { AppTabs } from '@/src/components/core';
import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';

export function CommitmentsView({
  activeTab,
  setActiveTab,
  tabOptions,
  subtitle,
  chrome,
}: CommitmentsViewModel & { chrome: TabScreenChrome }) {
  return (
    <ScreenWithChrome chrome={chrome} scrollable={false}>
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
    </ScreenWithChrome>
  );
}
