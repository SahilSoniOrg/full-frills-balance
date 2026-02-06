import { getContextualTokens, ThemeMode, useThemeColors } from '@/src/constants'
import { useTheme } from '@/src/hooks/use-theme'

export function useThemedComponent(themeMode?: ThemeMode) {
  const { theme: globalTheme, tokens: globalTokens } = useTheme()
  
  if (themeMode) {
    const theme = useThemeColors(themeMode)
    const tokens = getContextualTokens(theme)
    return { theme, tokens }
  }
  
  return { theme: globalTheme, tokens: globalTokens }
}
