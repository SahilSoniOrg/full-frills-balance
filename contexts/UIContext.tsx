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

import React, { createContext, useContext, useState } from 'react'
import { useColorScheme } from 'react-native'

// Simple UI state only - no domain data
interface UIState {
  // Onboarding state
  hasCompletedOnboarding: boolean
  
  // Theme preference
  themePreference: 'light' | 'dark' | 'system'
  
  // Simple UI flags
  isLoading: boolean
}

interface UIContextType extends UIState {
  // Actions for UI state only
  completeOnboarding: () => void
  setThemePreference: (theme: 'light' | 'dark' | 'system') => void
  setLoading: (loading: boolean) => void
}

const UIContext = createContext<UIContextType | undefined>(undefined)

export function UIProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme()
  
  const [uiState, setUIState] = useState<UIState>({
    hasCompletedOnboarding: false,
    themePreference: 'system',
    isLoading: false,
  })

  const completeOnboarding = () => {
    setUIState(prev => ({ ...prev, hasCompletedOnboarding: true }))
  }

  const setThemePreference = (theme: 'light' | 'dark' | 'system') => {
    setUIState(prev => ({ ...prev, themePreference: theme }))
  }

  const setLoading = (loading: boolean) => {
    setUIState(prev => ({ ...prev, isLoading: loading }))
  }

  const value: UIContextType = {
    ...uiState,
    completeOnboarding,
    setThemePreference,
    setLoading,
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

// Legacy export for backward compatibility
export const useUser = useUI
