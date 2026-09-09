import { Icon } from '@/src/types/domainIcons';
import { SettingsSegmentedControl } from '@/src/components/settings/SettingsSegmentedControl';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { DataExportSection } from '@/src/features/settings/components/DataExportSection';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import type { DataManagementViewModel } from '@/src/features/settings/hooks/useDataManagementViewModel';
import { ShareFormat } from '@/src/types/sharing';

interface DataManagementSettingsViewProps {
  vm: DataManagementViewModel;
}

const SHARE_FORMAT_OPTIONS = [
  { id: ShareFormat.TEXT, label: AppConfig.strings.settings.data.shareFormats.TEXT },
  { id: ShareFormat.CSV, label: AppConfig.strings.settings.data.shareFormats.CSV },
  { id: ShareFormat.MARKDOWN, label: AppConfig.strings.settings.data.shareFormats.MARKDOWN },
] as const;

export function DataManagementSettingsView({ vm }: DataManagementSettingsViewProps) {
  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.dataManagement}>
      <DataExportSection onImport={vm.onImport} />

      <Stack space="xxl">
        <SettingsMenu header="Sharing">
          <SettingsSegmentedControl
            leftIcon={Icon.Share}
            focusId="share-format"
            title={AppConfig.strings.settings.data.shareFormatTitle}
            description={AppConfig.strings.settings.data.shareFormatDesc}
            options={SHARE_FORMAT_OPTIONS}
            value={vm.defaultShareFormat}
            onChange={vm.setDefaultShareFormat}
            controlTestID="share-format-control"
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.data.reviewHeader}>
          <SettingsMenuItem
            searchId="audit-log"
            leftIcon={Icon.History}
            title={AppConfig.strings.settings.data.auditBtn}
            description={AppConfig.strings.settings.data.auditDesc}
            onPress={vm.onAuditLog}
          />
        </SettingsMenu>
      </Stack>
    </SettingsLayout>
  );
}
