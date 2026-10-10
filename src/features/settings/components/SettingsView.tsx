import { AppConfig } from '@/src/constants';
import { WorkplaceSwitcher } from '@/src/components/workplace/WorkplaceSwitcher';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { ListGroup, ListRow } from '@/src/components/core';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { useWorkplaceSnapshot } from '@/src/hooks/useWorkplaceSnapshot';
import { TextInput } from 'react-native';
import { SettingsSearchResults } from '@/src/features/settings/components/SettingsSearchResults';
import {
  createSettingsSearchCatalog,
  SETTINGS_HUB_SECTIONS,
  type SettingsActions,
} from '@/src/features/settings/components/settingsSections';
import { AppNavigation } from '@/src/utils/navigation';
import { useMemo, useRef, useState } from 'react';

export function SettingsView({ actions }: { actions: SettingsActions }) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const searchItems = useMemo(() => createSettingsSearchCatalog(actions), [actions]);
  const workplace = useOptionalWorkplace();
  const { data: currentWorkplace } = useWorkplaceSnapshot(workplace?.workplaceId);

  return (
    <SettingsLayout
      title={AppConfig.strings.settings.title}
      showBack={false}
      headerActions={<WorkplaceSwitcher />}
      scrollViewProps={{ onScrollBeginDrag: () => searchInputRef.current?.blur() }}
    >
      <Stack space="md">
        <SettingsSearchResults
          query={searchQuery}
          onQueryChange={setSearchQuery}
          items={searchItems}
          inputRef={searchInputRef}
        />
        {!searchQuery.trim() &&
          SETTINGS_HUB_SECTIONS.map(section => (
            <ListGroup variant="plain" key={section.header} header={section.header}>
              {section.rows.map(({ id, icon, title, description, action, testID }) => {
                const workplaceRow = id === 'workplace' ? currentWorkplace : undefined;
                return (
                  <ListRow
                    key={id}
                    focusId={id}
                    icon={workplaceRow?.icon ?? icon}
                    title={workplaceRow?.name ?? title}
                    subtitle={description}
                    onPress={() => actions[action]()}
                    testID={testID}
                  />
                );
              })}
            </ListGroup>
          ))}
      </Stack>
    </SettingsLayout>
  );
}

const SETTINGS_SCREEN_ACTIONS: SettingsActions = {
  onProfile: AppNavigation.toPersonalizationSettings,
  onAppearance: AppNavigation.toAppearanceSettings,
  onAutomation: AppNavigation.toAutomationSettings,
  onSmsSettings: AppNavigation.toSmsSettings,
  onSmsInbox: AppNavigation.toTransactionInbox,
  onSmsRules: AppNavigation.toSmsRules,
  onPrivacy: AppNavigation.toPrivacySecuritySettings,
  onPrivacyNotice: AppNavigation.toPrivacyNotice,
  onCurrentWorkplace: AppNavigation.toCurrentWorkplaceSettings,
  onDataManagement: AppNavigation.toDataManagementSettings,
  onMaintenance: AppNavigation.toMaintenanceSettings,
  onAbout: AppNavigation.toAboutSupportSettings,
  onDeviceSettings: AppNavigation.toDeviceSettings,
};

export default function SettingsScreen() {
  return <SettingsView actions={SETTINGS_SCREEN_ACTIONS} />;
}
