import { AppSegmentedControl, AppText, ListGroup, ListRow, Icon } from '@/src/components/core';
import { WorkplaceEditorModal } from '@/src/components/workplace/WorkplaceEditorModal';
import { AppConfig } from '@/src/constants';
import { CurrencySelector } from '@/src/features/accounts';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import {
  useWorkplaceSettingsViewModel,
  type WorkplaceSettingsViewModel,
} from '@/src/features/settings/hooks/useWorkplaceSettingsViewModel';
import { useState } from 'react';

interface WorkplaceSettingsViewProps {
  vm: WorkplaceSettingsViewModel;
}

const SAFE_TO_SPEND_OPTIONS = [
  { id: 30, label: '30 Days' },
  { id: 60, label: '60 Days' },
  { id: 90, label: '90 Days' },
] as const;

export function WorkplaceSettingsView({ vm }: WorkplaceSettingsViewProps) {
  const [isEditorVisible, setIsEditorVisible] = useState(false);
  const { activeWorkplace } = vm;

  return (
    <>
      <SettingsLayout title="Workplace settings">
        <Stack space="xl">
          <AppText variant="caption" color="secondary">
            Switch or create workplaces from the sidebar. These settings apply to the active
            workplace.
          </AppText>
          <ListGroup variant="plain" header="Active workplace">
            <ListRow
              focusId="active-workplace"
              icon={activeWorkplace.icon}
              title={activeWorkplace.name}
              subtitle="Rename this workplace or change its icon"
              onPress={() => setIsEditorVisible(true)}
              testID={`workplace-edit-${activeWorkplace.id}`}
            />
          </ListGroup>
          <ListGroup variant="plain" header="Active workplace defaults">
            <ListRow
              focusId="currency"
              icon={Icon.Bank}
              title={AppConfig.strings.settings.currency.title}
              subtitle={AppConfig.strings.settings.currency.description}
              trailing={
                <CurrencySelector
                  selectedCurrency={vm.workplaceCurrency}
                  currencies={vm.currencies}
                  onSelect={vm.onUpdateCurrency}
                  title={AppConfig.strings.settings.currency.selectTitle}
                />
              }
            />
            <ListRow
              icon={Icon.TrendingUp}
              focusId="safe-to-spend-forecast"
              title={AppConfig.strings.settings.personalization.forecastTitle}
              subtitle={AppConfig.strings.settings.personalization.forecastDesc}
            >
              <AppSegmentedControl
                options={SAFE_TO_SPEND_OPTIONS}
                value={vm.safeToSpendDays}
                onChange={vm.setSafeToSpendDays}
                flex
                size="md"
                testID="safe-to-spend-horizon"
              />
            </ListRow>
          </ListGroup>
          <ListGroup variant="plain" header="Danger zone">
            <ListRow
              focusId="delete-workplace"
              icon={Icon.Delete}
              title="Delete workplace"
              subtitle={`Permanently delete ${activeWorkplace.name} and its books`}
              onPress={vm.deleteWorkplace}
              destructive
              disabled={vm.deletingWorkplaceId !== null}
              testID={`workplace-delete-${activeWorkplace.id}`}
            />
          </ListGroup>
        </Stack>
      </SettingsLayout>
      <WorkplaceEditorModal
        key={`${activeWorkplace.id}:${activeWorkplace.name}:${activeWorkplace.icon}`}
        visible={isEditorVisible}
        name={activeWorkplace.name}
        icon={activeWorkplace.icon}
        onClose={() => setIsEditorVisible(false)}
        onSave={async (name, icon) => {
          if (await vm.updateWorkplaceDetails(name, icon)) {
            setIsEditorVisible(false);
          }
        }}
      />
    </>
  );
}

export default function WorkplaceSettingsScreen() {
  const vm = useWorkplaceSettingsViewModel();
  return <WorkplaceSettingsView vm={vm} />;
}
