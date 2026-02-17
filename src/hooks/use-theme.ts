/**
 * Theme Hook
 * 
 * Consolidates theme logic used across all screens.
 */

import { getContextualTokens, getFontTheme, getThemeColors } from '@/src/constants'
import { useThemeOverride, useUI } from '@/src/contexts/UIContext'

export function useTheme() {
    const { themePreference, themeId, fontId } = useUI()
    const themeOverride = useThemeOverride()
    const themeMode = themeOverride ?? (themePreference === 'system' ? 'dark' : themePreference)

    // Resolve dynamic theme and fonts
    const theme = getThemeColors(themeId, themeMode)
    const fonts = getFontTheme(fontId)
    const tokens = getContextualTokens(theme)

    return { theme, themeMode, fonts, tokens }
}
