import { Icon, AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Box, Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenuSection as SettingsMenu } from '@/src/features/settings/components/SettingsMenuSection';
import { SettingsSearchMenuItem as SettingsMenuItem } from '@/src/features/settings/components/SettingsSearchMenuItem';

export function DeviceSettingsView() {
  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.devicesAndSessions}>
      <Stack space="xl">
        <SettingsMenu header="This Device" focusId="devices">
          <SettingsMenuItem
            searchId="local-device"
            leftIcon={Icon.Settings}
            title="Local device"
            description="Preferences here apply only to this installation."
            hasArrow={false}
            disabled
          />
        </SettingsMenu>

        <SettingsMenu header="Future Sessions">
          <SettingsMenuItem
            searchId="other-devices"
            leftIcon={Icon.Briefcase}
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
