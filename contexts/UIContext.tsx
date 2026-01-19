/**
 * UI Context - Simple UI state management
 * 
 * ========================================
 * HARD RULES FOR THIS CONTEXT:
 * ========================================
 * - MAY contain: onboarding flags, theme preference, simple UI state
 * - MAY NOT contain: domain data, business logic, derived values, repository calls
 * - If it needs persistence → utils/preferences.ts
 * - If it needs logic → repository
 * - If it needs data → database
 * ========================================
 */

import React, { createContext, useContext, useEffect, useState } from 'react'
import { useColorScheme } from 'react-native'
import { preferences } from '../src/utils/preferences'

// Simple UI state only - no domain data
interface UIState {
  // Onboarding state
  hasCompletedOnboarding: boolean

  // Theme preference
  themePreference: 'light' | 'dark' | 'system'

  // Computed theme mode (resolved from preference + system)
  themeMode: 'light' | 'dark'

  // Simple UI flags
  isLoading: boolean
  isInitialized: boolean // Track if preferences are loaded
}

interface UIContextType extends UIState {
  // Actions for UI state only
  completeOnboarding: () => Promise<void>
  setThemePreference: (theme: 'light' | 'dark' | 'system') => Promise<void>
  setLoading: (loading: boolean) => void
  resetApp: () => Promise<void>
  cleanupDatabase: () => Promise<{ deletedCount: number }>
}

const UIContext = createContext<UIContextType | undefined>(undefined)

export function UIProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme()

  const [uiState, setUIState] = useState<UIState>({
    hasCompletedOnboarding: false,
    themePreference: 'system',
    themeMode: systemColorScheme === 'dark' ? 'dark' : 'light',
    isLoading: false,
    isInitialized: false,
  })

  // Update themeMode when preference or system scheme changes
  useEffect(() => {
    const newThemeMode = uiState.themePreference === 'system'
      ? (systemColorScheme === 'dark' ? 'dark' : 'light')
      : uiState.themePreference

    if (newThemeMode !== uiState.themeMode) {
      setUIState(prev => ({ ...prev, themeMode: newThemeMode }))
    }
  }, [uiState.themePreference, systemColorScheme])

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        setUIState(prev => ({ ...prev, isLoading: true }))

        const loadedPreferences = await preferences.loadPreferences()
        const themePreference = loadedPreferences.theme || 'system'
        const computedThemeMode = themePreference === 'system'
          ? (systemColorScheme === 'dark' ? 'dark' : 'light')
          : themePreference

        setUIState({
          hasCompletedOnboarding: loadedPreferences.onboardingCompleted,
          themePreference,
          themeMode: computedThemeMode,
          isLoading: false,
          isInitialized: true,
        })

        // Initialize currencies if needed (async, don't block UI)
        import('../src/services/currency-init-service').then(({ currencyInitService }) => {
          currencyInitService.initialize().catch(err => {
            // Silent fail - currencies are optional initialization
          })
        })

        // Run integrity check on startup (async, don't block UI)
        import('../src/services/IntegrityService').then(({ integrityService }) => {
          integrityService.runStartupCheck().catch(err => {
            console.warn('Failed to run integrity check:', err)
          })
        })
      } catch (error) {
        console.warn('Failed to load preferences:', error)
        setUIState(prev => ({ ...prev, isLoading: false, isInitialized: true }))
      }
    }

    loadPreferences()
  }, [])

  const completeOnboarding = async () => {
    try {
      await preferences.setOnboardingCompleted(true)
      setUIState(prev => ({ ...prev, hasCompletedOnboarding: true }))
    } catch (error) {
      console.warn('Failed to save onboarding state:', error)
      // Still update local state for better UX
      setUIState(prev => ({ ...prev, hasCompletedOnboarding: true }))
    }
  }

  const setThemePreference = async (theme: 'light' | 'dark' | 'system') => {
    try {
      await preferences.setTheme(theme)
      setUIState(prev => ({ ...prev, themePreference: theme }))
    } catch (error) {
      console.warn('Failed to save theme preference:', error)
      // Still update local state for better UX
      setUIState(prev => ({ ...prev, themePreference: theme }))
    }
  }

  const setLoading = (loading: boolean) => {
    setUIState(prev => ({ ...prev, isLoading: loading }))
  }

  const resetApp = async () => {
    try {
      setLoading(true)
      const { integrityService } = await import('../src/services/IntegrityService')
      await integrityService.resetDatabase()
      await preferences.clearPreferences()

      setUIState({
        hasCompletedOnboarding: false,
        themePreference: 'system',
        themeMode: systemColorScheme === 'dark' ? 'dark' : 'light',
        isLoading: false,
        isInitialized: true,
      })
    } catch (error) {
      console.warn('Failed to reset app:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const cleanupDatabase = async () => {
    try {
      setLoading(true)
      const { integrityService } = await import('../src/services/IntegrityService')
      const result = await integrityService.cleanupDatabase()
      return result
    } catch (error) {
      console.warn('Failed to cleanup database:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const value: UIContextType = {
    ...uiState,
    completeOnboarding,
    setThemePreference,
    setLoading,
    resetApp,
    cleanupDatabase,
  }

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUI() {
  const context = useContext(UIContext)
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider')
  }
  return context
}

// @deprecated Use useUI instead - to be removed in future version
export const useUser = useUI
