import { ModalSurface } from '@/src/components/common/ModalSurface';
import { AppButton, AppInput, AppText, IconButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import { Box, Inset, Stack } from '@/src/design-system';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { useAuth, authService } from '@/src/features/auth';
import { showErrorAlert, showSuccessAlert } from '@/src/utils/alerts';
import { useState } from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { useTheme } from '@/src/hooks/use-theme';

export default function IdentitySettingsScreen() {
  const { theme } = useTheme();
  const { profile, isAuthenticated, signOut, isLoading: isContextLoading } = useAuth();

  const [isEditNameModalVisible, setIsEditNameModalVisible] = useState(false);
  const [isEditEmailModalVisible, setIsEditEmailModalVisible] = useState(false);

  // Local state for edits
  const [localName, setLocalName] = useState(profile?.display_name || '');
  const [localEmail, setLocalEmail] = useState(profile?.email || '');

  // Auth flow states
  const [authEmail, setAuthEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isLocalLoading, setIsLocalLoading] = useState(false);

  const isLoading = isLocalLoading || isContextLoading;

  const handleSaveName = async () => {
    // Implement name update via Supabase if needed
    setIsEditNameModalVisible(false);
  };

  const handleSaveEmail = async () => {
    // Implement email update via Supabase if needed
    setIsEditEmailModalVisible(false);
  };

  const handleSendOtp = async () => {
    if (!authEmail) return;
    setIsLocalLoading(true);
    try {
      await authService.signInWithEmail(authEmail);
      setIsOtpSent(true);
      showSuccessAlert('Check your email', 'We sent you a login code.');
    } catch (e: any) {
      showErrorAlert(e, 'Failed to send OTP', true);
    } finally {
      setIsLocalLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp) return;
    setIsLocalLoading(true);
    try {
      await authService.verifyOtp(authEmail, otp);
      setIsOtpSent(false);
      setOtp('');
      setAuthEmail('');
    } catch (e: any) {
      showErrorAlert(e, 'Failed to verify code', true);
    } finally {
      setIsLocalLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLocalLoading(true);
    try {
      await authService.signInWithGoogle();
    } catch (e: any) {
      showErrorAlert(e, 'Failed to sign in with Google', true);
    } finally {
      setIsLocalLoading(false);
    }
  };

  return (
    <Screen title="Identity & Account" showBack={true} scrollable>
      <Inset space="md" vertical="md">
        <Stack space="xl">
          <SettingsMenu header="Identity Profile">
            <SettingsMenuItem
              leftIcon="user"
              title={profile?.display_name || 'Local User'}
              description="Update your display name"
              onPress={() => setIsEditNameModalVisible(true)}
              hasArrow={false}
              prominent
              rightContent={
                <IconButton
                  name="edit"
                  variant="clear"
                  size={18}
                  onPress={() => setIsEditNameModalVisible(true)}
                />
              }
            />

            {isAuthenticated && (
              <SettingsMenuItem
                leftIcon="mail"
                title={profile?.email || ''}
                description="Update your account email address"
                onPress={() => setIsEditEmailModalVisible(true)}
                hasArrow={false}
                prominent
                rightContent={
                  <IconButton
                    name="edit"
                    variant="clear"
                    size={18}
                    onPress={() => setIsEditEmailModalVisible(true)}
                  />
                }
              />
            )}
          </SettingsMenu>

          {!isAuthenticated && (
            <Box background="surfaceSecondary" padding="lg" borderRadius="lg">
              <Stack space="md">
                <Stack space="xs">
                  <AppText variant="subheading" weight="bold">
                    Cloud Account
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    Sign in or create an account to back up your data across all your devices.
                  </AppText>
                </Stack>

                {!isOtpSent ? (
                  <Stack space="md">
                    <AppButton
                      variant="secondary"
                      onPress={handleGoogleSignIn}
                      disabled={isLoading}
                    >
                      Continue with Google
                    </AppButton>

                    <View style={styles.divider} />

                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: theme.background, color: theme.text },
                      ]}
                      placeholder="Email address"
                      placeholderTextColor={theme.textSecondary}
                      value={authEmail}
                      onChangeText={setAuthEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      editable={!isLoading}
                    />
                    <AppButton onPress={handleSendOtp} disabled={isLoading || !authEmail}>
                      Email Magic Link
                    </AppButton>
                  </Stack>
                ) : (
                  <Stack space="md">
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: theme.background, color: theme.text },
                      ]}
                      placeholder="8-digit code"
                      placeholderTextColor={theme.textSecondary}
                      value={otp}
                      onChangeText={setOtp}
                      keyboardType="number-pad"
                      editable={!isLoading}
                    />
                    <AppButton onPress={handleVerifyOtp} disabled={isLoading || !otp}>
                      Verify Code
                    </AppButton>
                    <AppButton
                      variant="ghost"
                      onPress={() => setIsOtpSent(false)}
                      disabled={isLoading}
                    >
                      Back
                    </AppButton>
                  </Stack>
                )}
              </Stack>
            </Box>
          )}

          <Box paddingVertical="md" alignItems="center">
            <AppText variant="caption" color="secondary" align="center">
              {isAuthenticated
                ? `Signed in securely as ${profile?.email}`
                : 'You are currently using the app as a guest.'}
            </AppText>
          </Box>

          {isAuthenticated && (
            <Box marginTop="auto" paddingTop="xl">
              <AppButton
                variant="outline"
                onPress={signOut}
                disabled={isLoading}
                style={{ borderColor: 'rgba(255, 0, 0, 0.2)' }}
              >
                <AppText color="error">Sign Out</AppText>
              </AppButton>
            </Box>
          )}
        </Stack>
      </Inset>

      <ModalSurface
        visible={isEditNameModalVisible}
        title="Edit Name"
        onClose={() => setIsEditNameModalVisible(false)}
        fixedHeight={false}
        scrollable={false}
        footer={
          <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingTop: Spacing.md }}>
            <AppButton
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => setIsEditNameModalVisible(false)}
            >
              Cancel
            </AppButton>
            <AppButton variant="primary" style={{ flex: 1 }} onPress={handleSaveName}>
              Save
            </AppButton>
          </View>
        }
      >
        <Stack space="md">
          <AppText color="secondary">Update your display name</AppText>
          <AppInput
            value={localName}
            onChangeText={setLocalName}
            placeholder="Your Name"
            autoFocus
            onSubmitEditing={handleSaveName}
          />
        </Stack>
      </ModalSurface>

      <ModalSurface
        visible={isEditEmailModalVisible}
        title="Edit Email"
        onClose={() => setIsEditEmailModalVisible(false)}
        fixedHeight={false}
        scrollable={false}
        footer={
          <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingTop: Spacing.md }}>
            <AppButton
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => setIsEditEmailModalVisible(false)}
            >
              Cancel
            </AppButton>
            <AppButton variant="primary" style={{ flex: 1 }} onPress={handleSaveEmail}>
              Save
            </AppButton>
          </View>
        }
      >
        <Stack space="md">
          <AppText color="secondary">Update your account email address</AppText>
          <AppInput
            value={localEmail}
            onChangeText={setLocalEmail}
            placeholder="email@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
            onSubmitEditing={handleSaveEmail}
          />
        </Stack>
      </ModalSurface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 8,
  },
});
