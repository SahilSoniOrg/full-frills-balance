import { AppButton, AppCard, AppText } from '@/components/core'
import { Shape, Spacing, ThemeMode, useThemeColors } from '@/constants'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { useUser } from '../contexts/UIContext'

export default function OnboardingScreen() {
  const [name, setName] = useState('')
  const [isCompleting, setIsCompleting] = useState(false)
  const { themePreference } = useUser()
  const systemColorScheme = useColorScheme()

  // Derive theme mode following the explicit pattern from design preview
  const themeMode: ThemeMode = themePreference === 'system'
    ? (systemColorScheme === 'dark' ? 'dark' : 'light')
    : themePreference as ThemeMode

  const theme = useThemeColors(themeMode)
  const { completeOnboarding } = useUser()

  const handleContinue = async () => {
    if (!name.trim()) return;

    setIsCompleting(true);
    try {
      // Note: User name handling moved to preferences layer
      // For now, just complete onboarding
      completeOnboarding();
      router.push('/account-creation' as any);
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSkip = async () => {
    setIsCompleting(true);
    try {
      // Skip onboarding and go directly to accounts
      completeOnboarding();
      router.push('/accounts' as any);
    } catch (error) {
      console.error('Failed to skip onboarding:', error);
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <AppText variant="title" themeMode={themeMode} style={styles.title}>
          Welcome
        </AppText>
        <AppText variant="body" color="secondary" themeMode={themeMode} style={styles.subtitle}>
          Track your finances with precision and clarity.
        </AppText>

        <AppCard elevation="sm" padding="lg" style={styles.inputContainer} themeMode={themeMode}>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: theme.border,
                color: theme.text,
                backgroundColor: theme.surface
              }
            ]}
            placeholder="Enter your name"
            placeholderTextColor={theme.textSecondary}
            value={name}
            onChangeText={setName}
            autoFocus
          />
        </AppCard>

        <View style={styles.buttonContainer}>
          <AppButton
            variant="primary"
            size="lg"
            onPress={handleContinue}
            disabled={!name.trim() || isCompleting}
            themeMode={themeMode}
            style={styles.continueButton}
          >
            {isCompleting ? 'Setting up...' : 'Continue'}
          </AppButton>

          <AppButton
            variant="outline"
            size="lg"
            onPress={handleSkip}
            disabled={isCompleting}
            themeMode={themeMode}
            style={styles.skipButton}
          >
            Skip for now
          </AppButton>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  content: {
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  inputContainer: {
    marginBottom: Spacing.xl,
  },
  input: {
    borderWidth: 1,
    borderRadius: Shape.radius.r3,
    padding: Spacing.md,
    fontSize: 16,
  },
  buttonContainer: {
    gap: Spacing.md,
  },
  continueButton: {
    marginBottom: Spacing.md,
  },
  skipButton: {
    // Skip button uses outline variant, no additional styling needed
  },
});
