import { ListGroup, ListRow, Icon, AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Box, Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';

export function DeviceSettingsView() {
  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.devicesAndSessions}>
      <Stack space="xl">
        <ListGroup variant="plain" header="This Device" focusId="devices">
          <ListRow
            focusId="local-device"
            icon={Icon.Settings}
            title="Local device"
            subtitle="Preferences here apply only to this installation."
            chevron={false}
            disabled
          />
        </ListGroup>

        <ListGroup variant="plain" header="Future Sessions">
          <ListRow
            focusId="other-devices"
            icon={Icon.Briefcase}
            title="Other devices"
            subtitle="Remote sessions and sync will appear here when multi-device support is available."
            chevron={false}
            disabled
            testID="device-other-devices-placeholder"
          />
        </ListGroup>

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

export default DeviceSettingsView;
