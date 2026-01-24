/**
 * Theme Hook
 * 
 * Consolidates theme logic used across all screens.
 */

import { getContextualTokens, ThemeMode, useThemeColors } from '@/constants'
import { useUI } from '@/contexts/UIContext'
import { useColorScheme } from '@/hooks/use-color-scheme'

export function useTheme() {
    const { themePreference, defaultCurrency } = useUI()
    const systemColorScheme = useColorScheme()

    const themeMode: ThemeMode = themePreference === 'system'
        ? (systemColorScheme === 'dark' ? 'dark' : 'light')
        : themePreference as ThemeMode

    const theme = useThemeColors(themeMode)
    const tokens = getContextualTokens(theme)

    return { theme, themeMode, tokens }
}
