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
    heading: Platform.select({
      ios: 'Raleway-ExtraBold',
      android: 'Raleway-ExtraBold',
      default: 'system-ui',
    }),
    subheading: Platform.select({
      ios: 'Raleway-SemiBold',
      android: 'Raleway-SemiBold',
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
    r4: 16,  // Ivy r4
    r3: 20,  // Ivy r3
    r2: 24,  // Ivy r2
    r1: 32,  // Ivy r1
    full: 9999, // Circular elements
    sm: 8,   // Backward compatibility
    md: 12,  // Backward compatibility
    lg: 16,  // Backward compatibility
    xl: 24,  // Backward compatibility
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

// === IVY PALETTE ===
// Raw colors from Ivy Wallet source code
export const Palette = {
  white: '#FAFAFA',
  black: '#111114',
  trueBlack: '#000000',

  // Primary
  ivy: '#6B4DFF',
  purple: '#6B4DFF',
  purple1: '#C34CFF',
  purple2: '#FF4CFF',

  blue: '#4CC3FF',
  blue2: '#45E6E6',
  blue3: '#457BE6',

  green: '#14CC9E',
  green2: '#45E67B',
  green3: '#96E645',
  green4: '#C7E62E',

  yellow: '#FFEE33',
  orange: '#F29F30',
  orange2: '#E67B45',
  orange3: '#FFC34C',

  red: '#FF4060',
  red2: '#E62E2E',
  red3: '#FF4CA6',

  // Neutral
  mediumBlack: '#2B2C2D',
  gray: '#939199',
  mediumWhite: '#EFEEF0',
} as const

// === SEMANTIC COLORS ===
// Ivy Wallet inspired clean color palette
export const Colors = {
  // Light theme
  light: {
    // Primary colors
    primary: Palette.purple,
    primaryLight: '#D5CCFF',    // IvyLight

    // Semantic colors
    success: Palette.green,
    successLight: '#AAF2E0',    // GreenLight
    warning: Palette.orange,
    warningLight: '#FFDEB3',    // OrangeLight
    error: Palette.red,
    errorLight: '#FFCCD5',      // RedLight

    // Account type colors
    asset: Palette.blue,
    liability: Palette.orange,
    equity: Palette.green,
    income: Palette.green,
    expense: Palette.red,
    transfer: Palette.purple,

    // Neutral colors
    background: Palette.white,
    surface: '#F1F1F4',         // Medium in Ivy Light
    surfaceSecondary: '#E5E5E8',
    border: '#EBEBEF',
    text: Palette.black,
    textSecondary: Palette.gray,
    textTertiary: '#B1B1B8',
    icon: Palette.gray,

    // Special colors
    overlay: 'rgba(0, 0, 0, 0.5)',
    divider: '#EBEBEF',
    pure: '#FFFFFF',
    pureInverse: '#000000',
  },

  // Dark theme
  dark: {
    // Primary colors
    primary: Palette.purple,
    primaryLight: '#352680',    // IvyDark

    // Semantic colors
    success: Palette.green,
    successLight: '#0A664F',    // GreenDark
    warning: Palette.orange,
    warningLight: '#734B17',    // OrangeDark
    error: Palette.red,
    errorLight: '#801919',      // RedDark

    // Account type colors
    asset: '#266280',           // BlueDark
    liability: '#806226',        // Orange3Dark
    equity: '#0A664F',          // GreenDark
    income: '#14CC9E',          // Green
    expense: '#FF4060',         // Red
    transfer: Palette.purple,

    // Neutral colors
    background: Palette.black,
    surface: '#1B1C20',         // Medium in Ivy Dark
    surfaceSecondary: '#25262B',
    border: '#2A2B32',
    text: '#FAFAFC',            // White in Ivy
    textSecondary: Palette.gray,
    textTertiary: '#5C5C64',
    icon: Palette.gray,

    // Special colors
    overlay: 'rgba(0, 0, 0, 0.7)',
    divider: '#2A2B32',
    pure: '#000000',
    pureInverse: '#FFFFFF',
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
