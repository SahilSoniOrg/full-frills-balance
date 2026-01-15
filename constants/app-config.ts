/**
 * App Configuration - Behavior defaults and app-wide settings
 * 
 * This file contains values that affect BEHAVIOR, not visual appearance.
 * Visual tokens belong in design-tokens.ts
 */

export const AppConfig = {
  // Default currency for new accounts
  defaultCurrency: 'USD' as const,
  
  // Animation durations (in ms)
  animation: {
    fast: 200,
    normal: 300,
    slow: 500,
  },
  
  // Navigation and UI timing
  timing: {
    successDelay: 1000,  // Delay after success before navigation
    loadingDelay: 500,   // Minimum loading time
    debounceMs: 300,    // Input debounce timing
  },
  
  // Input constraints
  input: {
    maxAccountNameLength: 100,
    maxDescriptionLength: 255,
    maxNotesLength: 500,
  },
  
  // Pagination
  pagination: {
    defaultPageSize: 20,
    maxPageSize: 100,
  },
  
  // Feature toggles
  features: {
    enableAnalytics: false,  // Analytics collection
    enableDebugMode: false,  // Debug logging
    enableExperimentalFeatures: false,
  },
  
  // Performance settings
  performance: {
    maxConcurrentOperations: 5,
    cacheTimeoutMs: 300000,  // 5 minutes
  },
} as const
