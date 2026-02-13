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

import { ThemeMode } from '@/src/constants'
import { logger } from '@/src/utils/logger'
import { preferences } from '@/src/utils/preferences'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useColorScheme } from 'react-native'

// Simple UI state only - no domain data
interface UIState {
  // Onboarding state
  hasCompletedOnboarding: boolean

  // Theme preference
  themePreference: 'light' | 'dark' | 'system'

  // Simple UI flags
  isLoading: boolean
  isInitialized: boolean // Track if preferences are loaded

  // User details
  userName: string
  defaultCurrency: string

  // Privacy
  isPrivacyMode: boolean

  // Account Display
  showAccountMonthlyStats: boolean

  // Advanced Mode
  advancedMode: boolean

  // App Lifecycle
  isRestartRequired: boolean
  restartType: 'IMPORT' | 'RESET' | null
  importStats: { accounts: number; journals: number; transactions: number; auditLogs?: number; skippedTransactions: number; skippedItems?: { id: string; reason: string; description?: string }[] } | null
}

interface UIContextType extends UIState {
  // Computed value (not stored in state)
  themeMode: 'light' | 'dark'
  // Actions for UI state only
  completeOnboarding: (name: string, currency: string) => Promise<void>
  setThemePreference: (theme: 'light' | 'dark' | 'system') => Promise<void>
  updateUserDetails: (name: string, currency: string) => Promise<void>
  setPrivacyMode: (isPrivacyMode: boolean) => Promise<void>
  setShowAccountMonthlyStats: (show: boolean) => Promise<void>
  setAdvancedMode: (advancedMode: boolean) => Promise<void>
  requireRestart: (options: { type: 'IMPORT' | 'RESET'; stats?: { accounts: number; journals: number; transactions: number; auditLogs?: number; skippedTransactions: number; skippedItems?: { id: string; reason: string; description?: string }[] } }) => void
}

export const UIContext = createContext<UIContextType | undefined>(undefined)

export function UIProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme()

  const [uiState, setUIState] = useState<UIState>({
    hasCompletedOnboarding: false,
    themePreference: 'system',
    isLoading: false,
    isInitialized: false,
    userName: '',
    defaultCurrency: 'USD',
    isPrivacyMode: false,
    showAccountMonthlyStats: true,
    advancedMode: false,
    isRestartRequired: false,
    restartType: null,
    importStats: null,
  })

  const themeMode = useMemo<'light' | 'dark'>(() => {
    return uiState.themePreference === 'system'
      ? (systemColorScheme === 'dark' ? 'dark' : 'light')
      : uiState.themePreference
  }, [uiState.themePreference, systemColorScheme])

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        setUIState(prev => ({ ...prev, isLoading: true }))

        const loadedPreferences = await preferences.loadPreferences()
        const themePreference = loadedPreferences.theme || 'system'

        setUIState({
          hasCompletedOnboarding: loadedPreferences.onboardingCompleted,
          themePreference,
          userName: loadedPreferences.userName || '',
          defaultCurrency: loadedPreferences.defaultCurrencyCode || 'USD',
          isPrivacyMode: loadedPreferences.isPrivacyMode || false,
          showAccountMonthlyStats: loadedPreferences.showAccountMonthlyStats ?? true,
          advancedMode: loadedPreferences.advancedMode || false,
          isRestartRequired: false,
          restartType: null,
          importStats: null,
          isLoading: false,
          isInitialized: true,
        })

      } catch (error) {
        logger.warn('Failed to load preferences', { error })
        setUIState(prev => ({ ...prev, isLoading: false, isInitialized: true }))
      }
    }

    loadPreferences()
  }, [systemColorScheme])

  const completeOnboarding = useCallback(async (name: string, currency: string) => {
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
      logger.warn('Failed to save onboarding state', { error })
      // Still update local state for better UX
      setUIState(prev => ({ ...prev, hasCompletedOnboarding: true }))
    }
  }, [])

  const updateUserDetails = useCallback(async (name: string, currency: string) => {
    try {
      if (name) await preferences.setUserName(name)
      if (currency) await preferences.setDefaultCurrencyCode(currency)
      setUIState(prev => ({
        ...prev,
        userName: name || prev.userName,
        defaultCurrency: currency || prev.defaultCurrency
      }))
    } catch (error) {
      logger.warn('Failed to update user details', { error })
    }
  }, [])

  const setThemePreference = useCallback(async (theme: 'light' | 'dark' | 'system') => {
    try {
      await preferences.setTheme(theme)
      setUIState(prev => ({ ...prev, themePreference: theme }))
    } catch (error) {
      logger.warn('Failed to save theme preference', { error })
      // Still update local state for better UX
      setUIState(prev => ({ ...prev, themePreference: theme }))
    }
  }, [])

  const setPrivacyMode = useCallback(async (isPrivacyMode: boolean) => {
    try {
      await preferences.setIsPrivacyMode(isPrivacyMode)
      setUIState(prev => ({ ...prev, isPrivacyMode }))
    } catch (error) {
      logger.warn('Failed to save privacy mode', { error })
      setUIState(prev => ({ ...prev, isPrivacyMode }))
    }
  }, [])

  const setShowAccountMonthlyStats = useCallback(async (showAccountMonthlyStats: boolean) => {
    try {
      await preferences.setShowAccountMonthlyStats(showAccountMonthlyStats)
      setUIState(prev => ({ ...prev, showAccountMonthlyStats }))
    } catch (error) {
      logger.warn('Failed to save account stats preference', { error })
      setUIState(prev => ({ ...prev, showAccountMonthlyStats }))
    }
  }, [])

  const setAdvancedMode = useCallback(async (advancedMode: boolean) => {
    try {
      await preferences.setAdvancedMode(advancedMode)
      setUIState(prev => ({ ...prev, advancedMode }))
    } catch (error) {
      logger.warn('Failed to save advanced mode', { error })
      setUIState(prev => ({ ...prev, advancedMode }))
    }
  }, [])

  const requireRestart = (options: { type: 'IMPORT' | 'RESET'; stats?: { accounts: number; journals: number; transactions: number; auditLogs?: number; skippedTransactions: number; skippedItems?: { id: string; reason: string; description?: string }[] } }) => {
    setUIState(prev => ({ ...prev, isRestartRequired: true, restartType: options.type, importStats: options.stats || null }))
  }

  const value: UIContextType = {
    ...uiState,
    themeMode,
    completeOnboarding,
    setThemePreference,
    updateUserDetails,
    setPrivacyMode,
    setShowAccountMonthlyStats,
    setAdvancedMode,
    requireRestart,
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
