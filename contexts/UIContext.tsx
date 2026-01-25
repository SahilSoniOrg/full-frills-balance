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

import { ThemeMode } from '@/constants'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { useColorScheme } from 'react-native'
import { integrityService } from '../src/services/integrity-service'
import { logger } from '../src/utils/logger'
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

  // User details
  userName: string
  defaultCurrency: string

  // Privacy
  isPrivacyMode: boolean
}

interface UIContextType extends UIState {
  // Actions for UI state only
  completeOnboarding: (name: string, currency: string) => Promise<void>
  setThemePreference: (theme: 'light' | 'dark' | 'system') => Promise<void>
  setLoading: (loading: boolean) => void
  resetApp: () => Promise<void>
  cleanupDatabase: () => Promise<{ deletedCount: number }>
  updateUserDetails: (name: string, currency: string) => Promise<void>
  setPrivacyMode: (isPrivacyMode: boolean) => Promise<void>
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
    userName: '',
    defaultCurrency: 'USD',
    isPrivacyMode: false,
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
          userName: loadedPreferences.userName || '',
          defaultCurrency: loadedPreferences.defaultCurrencyCode || 'USD',
          isPrivacyMode: loadedPreferences.isPrivacyMode || false,
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
        import('../src/services/integrity-service').then(({ integrityService }) => {
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

  const completeOnboarding = async (name: string, currency: string) => {
    try {
      await preferences.setUserName(name)
      await preferences.setDefaultCurrencyCode(currency)
      await preferences.setOnboardingCompleted(true)
      setUIState(prev => ({
        ...prev,
        hasCompletedOnboarding: true,
        userName: name,
        defaultCurrency: currency
      }))
    } catch (error) {
      console.warn('Failed to save onboarding state:', error)
      // Still update local state for better UX
      setUIState(prev => ({ ...prev, hasCompletedOnboarding: true }))
    }
  }

  const updateUserDetails = async (name: string, currency: string) => {
    try {
      if (name) await preferences.setUserName(name)
      if (currency) await preferences.setDefaultCurrencyCode(currency)
      setUIState(prev => ({
        ...prev,
        userName: name || prev.userName,
        defaultCurrency: currency || prev.defaultCurrency
      }))
    } catch (error) {
      console.warn('Failed to update user details:', error)
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

  const setPrivacyMode = async (isPrivacyMode: boolean) => {
    try {
      await preferences.setIsPrivacyMode(isPrivacyMode)
      setUIState(prev => ({ ...prev, isPrivacyMode }))
    } catch (error) {
      console.warn('Failed to save privacy mode:', error)
      setUIState(prev => ({ ...prev, isPrivacyMode }))
    }
  }

  const setLoading = (loading: boolean) => {
    setUIState(prev => ({ ...prev, isLoading: loading }))
  }

  const resetApp = async () => {
    try {
      logger.warn('[UIContext] resetApp called. Starting process...')
      setLoading(true)

      logger.debug('[UIContext] Calling integrityService.resetDatabase()...')
      await integrityService.resetDatabase()

      logger.debug('[UIContext] Clearing preferences...')
      await preferences.clearPreferences()

      logger.info('[UIContext] Reset complete. Updating state...')
      setUIState({
        hasCompletedOnboarding: false,
        themePreference: 'system',
        themeMode: systemColorScheme === 'dark' ? 'dark' : 'light',
        userName: '',
        defaultCurrency: 'USD',
        isPrivacyMode: false,
        isLoading: false,
        isInitialized: true,
      })
    } catch (error) {
      logger.error('[UIContext] Failed to reset app:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const cleanupDatabase = async () => {
    try {
      logger.info('[UIContext] cleanupDatabase called.')
      setLoading(true)
      const result = await integrityService.cleanupDatabase()
      logger.info(`[UIContext] cleanupDatabase successful. Deleted ${result.deletedCount} records.`)
      return result
    } catch (error) {
      logger.error('[UIContext] Failed to cleanup database:', error)
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
    updateUserDetails,
    setPrivacyMode,
  }

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

// Support for local theme overrides (e.g. Design Preview)
const ThemeOverrideContext = createContext<ThemeMode | undefined>(undefined)

export function ThemeOverride({ mode, children }: { mode: ThemeMode; children: React.ReactNode }) {
  return <ThemeOverrideContext.Provider value={mode}>{children}</ThemeOverrideContext.Provider>
}

export function useThemeOverride() {
  return useContext(ThemeOverrideContext)
}

export function useUI() {
  const context = useContext(UIContext)
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider')
  }
  return context
}
