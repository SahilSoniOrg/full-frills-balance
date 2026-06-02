import { AppText, AppToggle } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Box, Inset, Stack } from '@/src/design-system';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { useAuth } from '@/src/features/auth';
import { AppNavigation } from '@/src/utils/navigation';

export default function AccountSettingsScreen() {
  const { profile, isAuthenticated, signOut } = useAuth();

  return (
    <Screen title="Account" showBack={true} scrollable>
      <Inset space="md" vertical="md">
        <Stack space="xl">
          <SettingsMenu header="Account">
            <SettingsMenuItem
              leftIcon="user"
              title={profile?.display_name || 'Local User'}
              description={
                profile?.email || (isAuthenticated ? 'Cloud Sync Enabled' : 'Offline Mode')
              }
              hasArrow={true}
              prominent
              onPress={AppNavigation.toIdentitySettings}
            />
          </SettingsMenu>

          {isAuthenticated && (
            <SettingsMenu header="Sync Preferences">
              <SettingsMenuItem
                leftIcon="refresh"
                title="Cloud Synchronization"
                description="Backup and sync data across devices"
                hasArrow={false}
                rightContent={<AppToggle value={true} onValueChange={() => {}} />}
              />
            </SettingsMenu>
          )}

          <Box paddingVertical="xl" alignItems="center">
            <AppText variant="caption" color="secondary" align="center">
              {isAuthenticated
                ? 'Your data is securely backed up and synced to your cloud account.'
                : 'Your data is stored locally on this device. Sign in to enable cloud sync and protect your data across all your devices.'}
            </AppText>
          </Box>

          {isAuthenticated && (
            <Box marginTop="auto" paddingTop="xl">
              <SettingsMenuItem
                leftIcon="logOut"
                title="Sign Out"
                description="Log out from your cloud account"
                onPress={signOut}
                hasArrow={false}
              />
            </Box>
          )}
        </Stack>
      </Inset>
    </Screen>
  );
}
