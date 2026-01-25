/**
 * Theme Hook
 * 
 * Consolidates theme logic used across all screens.
 */

import { getContextualTokens, ThemeMode, useThemeColors } from '@/constants'
import { useThemeOverride, useUI } from '@/contexts/UIContext'
import { useColorScheme } from '@/hooks/use-color-scheme'

export function useTheme() {
    const { themePreference } = useUI()
    const overrideMode = useThemeOverride()
    const systemColorScheme = useColorScheme()

    const themeMode: ThemeMode = overrideMode || (themePreference === 'system'
        ? (systemColorScheme === 'dark' ? 'dark' : 'light')
        : themePreference as ThemeMode)

    const theme = useThemeColors(themeMode)
    const tokens = getContextualTokens(theme)

    return { theme, themeMode, tokens }
}
