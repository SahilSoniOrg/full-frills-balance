import { getContextualTokens, ThemeMode, useThemeColors } from '@/src/constants'
import { useTheme } from '@/src/hooks/use-theme'

export function useThemedComponent(themeMode?: ThemeMode) {
  const { theme: globalTheme, tokens: globalTokens, fonts: globalFonts } = useTheme()
  const theme = useThemeColors(themeMode || 'light')
  const tokens = themeMode ? getContextualTokens(theme) : globalTokens
  // Fonts are global preference, not per-component theme mode usually,
  // but if we supported per-component font mode (unlikely), we'd handle it here.
  // For now, pass through global fonts.
  return { theme: themeMode ? theme : globalTheme, tokens, fonts: globalFonts }
}
