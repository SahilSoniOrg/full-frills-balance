import { AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Box, Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { SettingsToggleItem } from '@/src/features/settings/components/SettingsToggleItem';
import { Platform } from 'react-native';

interface DeviceSettingsViewProps {
  isSmsImportEnabled: boolean;
  onToggleSmsImport: (enabled: boolean) => void;
}

export function DeviceSettingsView({
  isSmsImportEnabled,
  onToggleSmsImport,
}: DeviceSettingsViewProps) {
  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.devicesAndSessions}>
      <Stack space="xl">
        <SettingsMenu header="This Device" focusId="devices">
          <SettingsMenuItem
            searchId="local-device"
            leftIcon="settings"
            title="Local device"
            description="Preferences here apply only to this installation."
            hasArrow={false}
            disabled
          />
        </SettingsMenu>

        {Platform.OS === 'android' && (
          <SettingsMenu header="Device Preferences">
            <SettingsToggleItem
              searchId="sms-import"
              leftIcon="zap"
              title={AppConfig.strings.settings.personalization.smsImportTitle}
              description="Automatically scan for transaction messages on this device."
              value={isSmsImportEnabled}
              onValueChange={onToggleSmsImport}
              testID="device-sms-import-toggle"
            />
          </SettingsMenu>
        )}

        <SettingsMenu header="Future Sessions">
          <SettingsMenuItem
            searchId="other-devices"
            leftIcon="briefcase"
            title="Other devices"
            description="Remote sessions and sync will appear here when multi-device support is available."
            hasArrow={false}
            disabled
            testID="device-other-devices-placeholder"
          />
        </SettingsMenu>

        <Box paddingHorizontal="md">
          <AppText variant="caption" color="secondary">
            Device identity and the active workplace are managed automatically for this
            installation.
          </AppText>
        </Box>
      </Stack>
    </SettingsLayout>
  );
}
