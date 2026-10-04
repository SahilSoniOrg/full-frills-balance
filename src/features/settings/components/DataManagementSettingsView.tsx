import { Icon } from '@/src/types/domainIcons';
import { SettingsSegmentedControl } from '@/src/components/settings/SettingsSegmentedControl';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { DataExportSection } from '@/src/features/settings/components/DataExportSection';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenuSection as SettingsMenu } from '@/src/features/settings/components/SettingsMenuSection';
import { SettingsSearchMenuItem as SettingsMenuItem } from '@/src/features/settings/components/SettingsSearchMenuItem';
import { useSharePrefs } from '@/src/hooks/useSharePrefs';
import { ShareFormat } from '@/src/types/sharing';
import { AppNavigation } from '@/src/utils/navigation';

const SHARE_FORMAT_OPTIONS = [
  { id: ShareFormat.TEXT, label: AppConfig.strings.settings.data.shareFormats.TEXT },
  { id: ShareFormat.CSV, label: AppConfig.strings.settings.data.shareFormats.CSV },
  { id: ShareFormat.MARKDOWN, label: AppConfig.strings.settings.data.shareFormats.MARKDOWN },
] as const;

function DataManagementSettingsView() {
  const { defaultShareFormat, setDefaultShareFormat } = useSharePrefs();

  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.dataManagement}>
      <DataExportSection onImport={() => AppNavigation.toSetupJourney('settings_restore')} />

      <Stack space="xxl">
        <SettingsMenu header="Sharing">
          <SettingsSegmentedControl
            leftIcon={Icon.Share}
            focusId="share-format"
            title={AppConfig.strings.settings.data.shareFormatTitle}
            description={AppConfig.strings.settings.data.shareFormatDesc}
            options={SHARE_FORMAT_OPTIONS}
            value={defaultShareFormat}
            onChange={setDefaultShareFormat}
            controlTestID="share-format-control"
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.data.reviewHeader}>
          <SettingsMenuItem
            searchId="audit-log"
            leftIcon={Icon.History}
            title={AppConfig.strings.settings.data.auditBtn}
            description={AppConfig.strings.settings.data.auditDesc}
            onPress={AppNavigation.toAuditLog}
          />
        </SettingsMenu>
      </Stack>
    </SettingsLayout>
  );
}

export default DataManagementSettingsView;
