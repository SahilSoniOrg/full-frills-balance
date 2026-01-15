import { AppButton, AppCard, AppText } from '@/components/core'
import { Spacing, ThemeMode, useThemeColors } from '@/constants'
import { useUser } from '@/contexts/UIContext'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Link } from 'expo-router'
import { StyleSheet, View } from 'react-native'

export default function ModalScreen() {
  const { themePreference } = useUser()
  const systemColorScheme = useColorScheme()
  
  // Derive theme mode following the explicit pattern from design preview
  const themeMode: ThemeMode = themePreference === 'system' 
    ? (systemColorScheme === 'dark' ? 'dark' : 'light')
    : themePreference as ThemeMode
  
  const theme = useThemeColors(themeMode)

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <AppCard elevation="md" padding="lg" themeMode={themeMode}>
        <AppText variant="heading" themeMode={themeMode} style={styles.title}>
          This is a modal
        </AppText>
        <Link href="/" dismissTo style={styles.link}>
          <AppButton variant="outline" themeMode={themeMode}>
            Go to home screen
          </AppButton>
        </Link>
      </AppCard>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  link: {
    marginTop: Spacing.md,
  },
})
