import { AppSegmentedControl, ListGroup, ListRow } from '@/src/components/core';
import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { DataExportSection } from '@/src/features/settings/components/DataExportSection';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
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
        <ListGroup variant="plain" header="Sharing">
          <ListRow
            icon={Icon.Share}
            focusId="share-format"
            title={AppConfig.strings.settings.data.shareFormatTitle}
            subtitle={AppConfig.strings.settings.data.shareFormatDesc}
          >
            <AppSegmentedControl
              options={SHARE_FORMAT_OPTIONS}
              value={defaultShareFormat}
              onChange={setDefaultShareFormat}
              flex
              size="md"
              testID="share-format-control"
            />
          </ListRow>
        </ListGroup>

        <ListGroup variant="plain" header={AppConfig.strings.settings.data.reviewHeader}>
          <ListRow
            focusId="audit-log"
            icon={Icon.History}
            title={AppConfig.strings.settings.data.auditBtn}
            subtitle={AppConfig.strings.settings.data.auditDesc}
            onPress={AppNavigation.toAuditLog}
          />
        </ListGroup>
      </Stack>
    </SettingsLayout>
  );
}

export default DataManagementSettingsView;
