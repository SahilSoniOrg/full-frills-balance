/**
 * Design Tokens - Ivy Wallet inspired aesthetic
 * Clean, minimal, and opinionated design system
 * 
 * ========================================
 * DESIGN SYSTEM PRINCIPLES (BINDING)
 * ========================================
 * 
 * 1. Opinionated over flexible
 *    - Components should have strong defaults
 *    - If a prop or variant doesn't have a clear, current product use case, it should not exist
 *    - We prefer duplication over premature abstraction
 * 
 * 2. Semantic over literal
 *    - No raw hex colors, rgba values, or ad-hoc color logic anywhere
 *    - All colors must come from semantic tokens (e.g. surface, textSecondary, asset, expense)
 *    - Same applies to spacing, typography, radius, elevation
 * 
 * 3. Visual consistency > developer convenience
 *    - It should be harder to do the "wrong" thing than the "right" thing
 *    - If something feels annoying to use, that's a signal to simplify the API, not bypass it
 * 
 * ========================================
 * THEME CONSUMPTION RULE (LOCKED)
 * ========================================
 * 
 * ALL core components require explicit themeMode prop:
 * 
 * ```tsx
 * <AppText themeMode={themeMode}>Text</AppText>
 * <AppCard themeMode={themeMode}>Content</AppCard>
 * 
 * // useThemeColors must receive themeMode explicitly
 * const theme = useThemeColors(themeMode)
 * ```
 * 
 * This is not optional. This is the API contract.
 * The design preview demonstrates this exact usage pattern.
 * 
 * ========================================
 * DESIGN PREVIEW SCREEN RULES
 * ========================================
 * 
 * The design preview is the visual source of truth.
 * 
 * Rules:
 * - ZERO hardcoded colors or magic numbers
 * - It must consume the design system exactly like the app does
 * - No inline theme conditionals
 * - No "just for demo" styling shortcuts
 * - If it looks wrong here, it is wrong everywhere
 * 
 * Purpose:
 * - Visual regression detection
 * - Taste alignment ("does this feel Ivy-ish?")
 * - Sanity check for future changes
 * 
 * It is NOT:
 * - A Storybook
 * - An exhaustive prop showcase
 * - A playground for theoretical variants
 * 
 * Only combinations we actually intend to use should appear there.
 * 
 * ========================================
 * COMPONENT DESIGN RULES
 * ========================================
 * 
 * Base components (AppText, AppCard, AppButton, ListRow, Badge, Divider):
 * 
 * - Must encode visual identity
 * - Must be hard to misuse
 * - Must stay small and strict
 * - No variant explosion
 * - No layout primitives (Stack, Box, Flex, etc.)
 * 
 * If a component needs more than ~5 meaningful props, it's probably wrong.
 * 
 * ========================================
 * MIGRATION STRATEGY
 * ========================================
 * 
 * - New UI must use the design system
 * - Existing screens migrate only when touched for feature or bug work
 * - No mass refactors "just to migrate"
 * - No visual churn without user-facing benefit
 * 
 * ========================================
 * CHANGE POLICY
 * ========================================
 * 
 * - Design system API is frozen for now
 * - No new variants, props, or tokens without a concrete use case
 * - Any proposed change must improve the design preview screen
 * - If a change can't justify itself visually, it doesn't ship
 * 
 * ========================================
 * DESIGN TOKENS
 * ========================================
 */

import { Platform } from 'react-native'

// === SPACING SCALE ===
// Based on 4px grid system for consistency
export const Spacing = {
  xs: 4,    // 0.25rem
  sm: 8,    // 0.5rem
  md: 12,   // 0.75rem
  lg: 16,   // 1rem
  xl: 20,   // 1.25rem
  xxl: 24,  // 1.5rem
  xxxl: 32, // 2rem
  xxxxl: 40, // 2.5rem
  full: 9999, // Circular elements
}

// === SIZE SCALE ===
// For consistent sizing across components
export const Size = {
  xs: 16,   // Small icons, compact elements
  sm: 20,   // Small icons
  md: 24,   // Medium icons, touch targets
  lg: 32,   // Large icons
  xl: 40,   // Extra large icons
  xxl: 48,  // Extra extra large icons
} as const

// === TYPOGRAPHY SCALE ===
// Clean, readable hierarchy inspired by Ivy Wallet
export const Typography = {
  // Font families
  fonts: {
    regular: Platform.select({
      ios: 'SF Pro Display',
      android: 'Roboto',
      default: 'system-ui',
    }),
    medium: Platform.select({
      ios: 'SF Pro Display-Medium',
      android: 'Roboto-Medium',
      default: 'system-ui',
    }),
    semibold: Platform.select({
      ios: 'SF Pro Display-Semibold',
      android: 'Roboto-Medium',
      default: 'system-ui',
    }),
    bold: Platform.select({
      ios: 'SF Pro Display-Bold',
      android: 'Roboto-Bold',
      default: 'system-ui',
    }),
  },

  // Font sizes
  sizes: {
    xs: 12,    // Small labels, captions
    sm: 14,    // Secondary text, form labels
    base: 16,  // Body text, standard content
    lg: 18,    // Important text, section headers
    xl: 20,    // Card titles, screen headers
    xxl: 24,   // Large headers
    xxxl: 32,  // Hero titles
  },

  // Line heights for readability
  lineHeights: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },

  // Letter spacing for clean typography
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
  },
} as const

// === RADIUS & ELEVATION ===
// Subtle, consistent shadows and rounded corners
export const Shape = {
  radius: {
    none: 0,
    sm: 4,   // Small elements, badges
    md: 8,   // Buttons, inputs
    lg: 12,  // Cards
    xl: 16,  // Large cards, modals
    full: 9999, // Circular elements
  },

  elevation: {
    none: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 3,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 6,
    },
  },
} as const

// === SEMANTIC COLORS ===
// Ivy Wallet inspired clean color palette
export const Colors = {
  // Light theme
  light: {
    // Primary colors
    primary: '#007AFF',        // iOS blue, clean and professional
    primaryLight: '#E3F2FD',    // Light blue for backgrounds
    
    // Semantic colors
    success: '#10B981',         // Clean green
    successLight: '#D1FAE5',    // Light green background
    warning: '#F59E0B',         // Warm amber
    warningLight: '#FEF3C7',   // Light amber background
    error: '#EF4444',           // Clean red
    errorLight: '#FEE2E2',      // Light red background
    
    // Account type colors (subtle, professional)
    asset: '#007AFF',           // Blue for assets
    liability: '#F59E0B',        // Amber for liabilities
    equity: '#10B981',          // Green for equity
    income: '#10B981',          // Green for income
    expense: '#EF4444',         // Red for expenses
    
    // Neutral colors
    background: '#FFFFFF',       // Pure white
    surface: '#F8F9FA',         // Light gray for cards
    surfaceSecondary: '#F1F3F4', // Slightly darker surface
    border: '#E5E7EB',          // Subtle borders
    text: '#1F2937',            // Dark gray for text
    textSecondary: '#6B7280',   // Medium gray for secondary text
    textTertiary: '#9CA3AF',    // Light gray for tertiary text
    icon: '#6B7280',            // Medium gray for icons
    
    // Special colors
    overlay: 'rgba(0, 0, 0, 0.5)', // Modal overlays
    divider: '#E5E7EB',         // Dividers
  },

  // Dark theme
  dark: {
    // Primary colors
    primary: '#0A84FF',        // Lighter blue for dark mode
    primaryLight: '#1E3A8A',    // Dark blue background
    
    // Semantic colors
    success: '#34D399',         // Lighter green
    successLight: '#064E3B',    // Dark green background
    warning: '#FBBF24',         // Lighter amber
    warningLight: '#78350F',    // Dark amber background
    error: '#F87171',           // Lighter red
    errorLight: '#7F1D1D',      // Dark red background
    
    // Account type colors (adjusted for dark mode)
    asset: '#0A84FF',           // Lighter blue
    liability: '#FBBF24',       // Lighter amber
    equity: '#34D399',          // Lighter green
    income: '#34D399',          // Lighter green
    expense: '#F87171',         // Lighter red
    
    // Neutral colors
    background: '#000000',       // Pure black
    surface: '#1C1C1E',         // Dark gray for cards
    surfaceSecondary: '#2C2C2E', // Slightly lighter surface
    border: '#38383A',          // Subtle borders
    text: '#FFFFFF',            // White for text
    textSecondary: '#AEAEB2',   // Light gray for secondary text
    textTertiary: '#8E8E93',    // Medium gray for tertiary text
    icon: '#AEAEB2',            // Light gray for icons
    
    // Special colors
    overlay: 'rgba(0, 0, 0, 0.7)', // Darker overlays
    divider: '#4A4A4C',         // More visible dividers in dark mode
  },
} as const

// === APP CONSTANTS ===
// NOTE: Behavior constants moved to app-config.ts
// This file now contains only visual design tokens

// === TYPE DEFINITIONS ===
export type ThemeMode = 'light' | 'dark'
export type ColorKey = keyof typeof Colors.light
export type SpacingKey = keyof typeof Spacing
export type TypographySize = keyof typeof Typography.sizes
export type RadiusKey = keyof typeof Shape.radius
export type ElevationKey = keyof typeof Shape.elevation
