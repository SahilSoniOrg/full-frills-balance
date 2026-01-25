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
 * THEME CONSUMPTION BEST PRACTICE
 * ========================================
 * 
 * Use the `useTheme()` hook from `@/hooks/use-theme` for theme access:
 * 
 * ```tsx
 * import { useTheme } from '@/hooks/use-theme';
 * 
 * const MyComponent = () => {
 *   const { theme } = useTheme();
 *   return <View style={{ backgroundColor: theme.background }} />;
 * };
 * ```
 * 
 * Note: Core components accept an optional `themeMode` prop for the design
 * preview screen only. Normal app code should NOT pass themeMode explicitly.
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

// === OPACITY SCALE ===
// Consistent transparency for overlays and semantic highlights
export const Opacity = {
  none: 0,
  soft: 0.15,    // Selection highlights, secondary surfaces
  muted: 0.3,   // Placeholders, disabled states
  medium: 0.5,  // Overlays, inactive tabs
  heavy: 0.7,   // Modal backdrops
  solid: 1,
} as const

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
    hero: 72,  // Massive financial amounts
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
    xs: 4,   // Very small components
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
      elevation: 1,
      // @ts-ignore - boxShadow is valid in RN 0.81+ and Web
      boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)',
    },
    md: {
      elevation: 3,
      // @ts-ignore
      boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.08)',
    },
    lg: {
      elevation: 6,
      // @ts-ignore
      boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.12)',
    },
  },
} as const

// === IVY PALETTE ===
// Exact colors from Ivy Wallet source code (IvyColors.kt)
export const Palette = {
  // Neutrals
  white: '#FAFAFC', // IvyColors.White
  extraLightGray: '#EBEBF0', // IvyColors.ExtraLightGray
  lightGray: '#CBCBD6', // IvyColors.LightGray
  gray: '#74747A', // IvyColors.Gray
  darkGray: '#303033', // IvyColors.DarkGray
  extraDarkGray: '#1C1C1F', // IvyColors.ExtraDarkGray
  black: '#09090A', // IvyColors.Black
  trueBlack: '#000000', // IvyColors.TrueBlack
  pureWhite: '#FFFFFF', // Absolute white for high contrast

  // Purple (Primary)
  purple: '#5C3DF5', // IvyColors.Purple.primary
  purpleLight: '#9987F5', // IvyColors.Purple.light
  purpleDark: '#36248F', // IvyColors.Purple.dark
  purpleExtraLight: '#B8ABF5', // IvyColors.Purple.extraLight

  // Green (Success/Income)
  green: '#12B880', // IvyColors.Green.primary
  greenLight: '#5AE0B4', // IvyColors.Green.light
  greenDark: '#0C7A56', // IvyColors.Green.dark
  greenExtraLight: '#ABF5DC', // IvyColors.Green.extraLight

  // Red (Error/Expense)
  red: '#F53D3D', // IvyColors.Red.primary
  redLight: '#F5AB87', // IvyColors.Red.light (Salmon-ish)
  redDark: '#8F2424', // IvyColors.Red.dark
  redExtraLight: '#F5ABAB', // IvyColors.Red.extraLight

  // Orange (Warning)
  orange: '#F57A3D', // IvyColors.Orange.primary
  orangeLight: '#F5AB87', // IvyColors.Orange.light
  orangeDark: '#8F4724', // IvyColors.Orange.dark

  // Blue (Asset)
  blue: '#3193F5', // IvyColors.Blue.primary
  blueLight: '#87BEF5', // IvyColors.Blue.light
  blueDark: '#24598F', // IvyColors.Blue.dark

  // Yellow
  yellow: '#F5D018', // IvyColors.Yellow.primary
} as const

// === THEME TYPES ===
export interface Theme {
  primary: string
  primaryLight: string
  success: string
  successLight: string
  warning: string
  warningLight: string
  error: string
  errorLight: string
  asset: string
  liability: string
  equity: string
  income: string
  expense: string
  transfer: string
  background: string
  surface: string
  surfaceSecondary: string
  border: string
  text: string
  textSecondary: string
  textTertiary: string
  icon: string
  overlay: string
  divider: string
  pure: string
  pureInverse: string
}

// === SEMANTIC COLORS ===
// Ivy Wallet inspired clean color palette
export const Colors: { light: Theme; dark: Theme } = {
  // Light theme - Matches IvyMaterial3Theme ivyLightColorScheme
  light: {
    // Primary colors
    primary: Palette.purple,
    primaryLight: Palette.purpleExtraLight, // Using ExtraLight for nicer backgrounds than Light

    // Semantic colors
    success: Palette.green,
    successLight: Palette.greenExtraLight, // Lighter tint for backgrounds
    warning: Palette.orange,
    warningLight: '#FFE8D6', // Custom softer orange tint (Ivy's orangeLight is same as redLight)
    error: Palette.red,
    errorLight: Palette.redExtraLight,     // Using ExtraLight as Light is too dark/orange

    // Account type colors
    asset: Palette.blue,
    liability: Palette.orange,
    equity: Palette.green,
    income: Palette.green,
    expense: Palette.red,
    transfer: Palette.purple,

    // Neutral colors
    background: Palette.white,
    surface: Palette.white,        // Ivy uses White for surface
    surfaceSecondary: Palette.extraLightGray, // Ivy uses SurfaceVariant
    border: Palette.extraLightGray,
    text: Palette.black,
    textSecondary: Palette.gray,
    textTertiary: Palette.lightGray,
    icon: Palette.gray,

    // Special colors
    overlay: 'rgba(9, 9, 10, 0.5)',
    divider: Palette.extraLightGray,
    pure: '#FFFFFF',
    pureInverse: '#000000',
  },

  // Dark theme - Matches IvyMaterial3Theme ivyDarkColorScheme
  dark: {
    // Primary colors
    primary: Palette.purple,
    primaryLight: Palette.purpleDark,    // Darker tint for backgrounds

    // Semantic colors
    success: Palette.green,
    successLight: Palette.greenDark,
    warning: Palette.orange,
    warningLight: Palette.orangeDark,
    error: Palette.red,
    errorLight: Palette.redDark,

    // Account type colors
    asset: Palette.blue,
    liability: Palette.orange,
    equity: Palette.green,
    income: Palette.green,
    expense: Palette.red,
    transfer: Palette.purple,

    // Neutral colors
    background: Palette.black,   // Ivy uses Black or TrueBlack
    surface: Palette.extraDarkGray, // Ivy SurfaceVariant for dark is ExtraDarkGray? No, Surface is TrueBlack/Black.
    // Let's use ExtraDarkGray for cards to separate from Black background
    surfaceSecondary: '#25252A',   // Slightly lighter than ExtraDarkGray
    border: Palette.darkGray,
    text: Palette.white,
    textSecondary: Palette.lightGray,
    textTertiary: Palette.gray,
    icon: Palette.lightGray,

    // Special colors
    overlay: 'rgba(0, 0, 0, 0.8)',
    divider: Palette.darkGray,
    pure: '#000000',
    pureInverse: '#FFFFFF',
  },
} as const

// === CONTEXTUAL TOKENS ===
// Specific UI roles mapped to semantic colors
// These will be used by core components to reduce ad-hoc styling
export type ContextualTokens = {
  input: {
    background: string
    border: string
    text: string
    placeholder: string
  }
  card: {
    background: string
    border: string
  }
  hero: {
    text: string
    placeholder: string
  }
}

export const getContextualTokens = (theme: Theme): ContextualTokens => ({
  input: {
    background: theme.surface,
    border: theme.border,
    text: theme.text,
    placeholder: theme.textTertiary,
  },
  card: {
    background: theme.surface,
    border: theme.border,
  },
  hero: {
    text: theme.text,
    placeholder: withOpacity(theme.text, Opacity.muted),
  },
})

// === UTILITIES ===
/**
 * Apply opacity to a hex color
 * @param color - Hex color string (e.g., '#6B4DFF')
 * @param opacity - Opacity value from 0 to 1
 * @returns RGBA color string
 */
export function withOpacity(color: string, opacity: number): string {
  // Handle both 3 and 6 character hex codes
  const hex = color.replace('#', '');
  const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.substring(0, 2), 16);
  const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.substring(2, 4), 16);
  const b = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// === TYPE DEFINITIONS ===
export type ThemeMode = 'light' | 'dark'
export type ColorKey = keyof Theme
export type SpacingKey = keyof typeof Spacing
export type TypographySize = keyof typeof Typography.sizes
export type RadiusKey = keyof typeof Shape.radius
export type ElevationKey = keyof typeof Shape.elevation
