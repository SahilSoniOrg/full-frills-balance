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
  selection: 0.05, // Selection highlights
  hover: 0.1,      // Hover states
  soft: 0.15,    // Secondary surfaces
  muted: 0.3,   // Placeholders, disabled states
  medium: 0.5,  // Overlays, inactive tabs
  heavy: 0.7,   // Modal backdrops
  solid: 1,
} as const

// === SIZE SCALE ===
// For consistent sizing across components
export const Size = {
  // Base scale
  xs: 16,   // Small icons, compact elements
  sm: 20,   // Small icons
  md: 24,   // Medium icons, touch targets
  lg: 32,   // Large icons
  xl: 40,   // Extra large icons
  xxl: 48,  // Extra extra large icons
  fab: 64,  // Main FAB size
  xxs: 12,  // Micro icons / indicators

  // Button sizes
  buttonSm: 32,
  buttonMd: 44,
  buttonLg: 52,
  buttonXl: 60,

  // Input sizes
  inputMd: 48,
  inputLg: 60,
  textareaHeight: 80,

  // Icon sizes (semantic)
  iconXs: 16,
  iconSm: 20,
  iconMd: 24,
  iconLg: 28,
  iconXl: 32,

  // Avatar sizes
  avatarSm: 32,
  avatarMd: 48,
  avatarLg: 64,
  avatarXl: 100,

  // Touch targets (minimum 44pt for accessibility)
  touchTarget: 44,
  touchTargetLg: 48,

  // Header/Navigation
  headerHeight: 64,
  navBarButton: 44,

  // Card minimums
  cardMinWidth: 160,
  cardMinHeight: 110,
  maxContentWidth: 400,

  // Grid layout
  gridItemWidth: '46%',
  gridItemMargin: '2%',
} as const

// === THEME ID ===
export const ThemeIds = {
  DEEP_SPACE: 'deep-space',
  IVY: 'ivy',
} as const;

export type ThemeId = typeof ThemeIds[keyof typeof ThemeIds];

// === FONT ID ===
export const FontIds = {
  DEEP_SPACE: 'deep-space',
  IVY: 'ivy',
} as const;

export type FontId = typeof FontIds[keyof typeof FontIds];

// === TYPOGRAPHY SCALE ===
// Clean, readable hierarchy inspired by Ivy Wallet
export const Typography = {
  // Font families
  fonts: {
    regular: 'InstrumentSans-Regular',
    medium: 'InstrumentSans-Medium',
    semibold: 'InstrumentSans-SemiBold',
    bold: 'InstrumentSans-Bold',
    heading: 'DMSerifDisplay-Regular',
    subheading: 'InstrumentSans-Bold', // Use Bold Sans for subheadings instead of Serif if preferred, or DMSerifDisplay-Regular
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

// === FONT SCHEMES ===
// === FONT SCHEMES ===

export interface FontTheme {
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
  heading: string;
  subheading: string;
}

const DeepSpaceFonts: FontTheme = {
  regular: 'InstrumentSans-Regular',
  medium: 'InstrumentSans-Medium',
  semibold: 'InstrumentSans-SemiBold',
  bold: 'InstrumentSans-Bold',
  heading: 'DMSerifDisplay-Regular',
  subheading: 'InstrumentSans-Bold',
};

const IvyFonts: FontTheme = {
  regular: 'Raleway-Regular',
  medium: 'Raleway-Medium',
  semibold: 'Raleway-SemiBold',
  bold: 'Raleway-Bold',
  heading: 'Raleway-Bold', // Ivy uses Sans for headings too
  subheading: 'Raleway-SemiBold',
};

export const FontSchemes: Record<FontId, FontTheme> = {
  [FontIds.DEEP_SPACE]: DeepSpaceFonts,
  [FontIds.IVY]: IvyFonts,
};

export const getFontTheme = (fontId: FontId): FontTheme => {
  return FontSchemes[fontId] || FontSchemes[FontIds.DEEP_SPACE];
};

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



// === LANDING PAGE PALETTE (Deep Space) ===
// Deep Space & Mint Theme
export const DeepSpacePalette = {
  // Neutrals (Rich Space Grays)
  background: '#0A0A0C',     // Main background (Deep Space)
  surface: '#1E1E26',        // Cards/Containers (Deep Purple-Gray)
  surfaceHighlight: '#2A2A35', // Hover/Active states

  // Text
  textPrimary: '#F0ECE4',    // Bone/Off-White (High Contrast)
  textSecondary: '#8A8694',  // Muted Lavender/Gray

  // Brand / Accents
  mint: '#7DD3A8',           // Primary Accent (Success/Income/Brand)
  mintDim: '#2A4A3D',        // Muted Mint (Backgrounds)

  // Semantic
  red: '#EB5757',            // Error/Expense
  redDim: '#4A2A2A',         // Muted Red
  blue: '#5D9CEC',           // Asset
  blueDim: '#1F2C3D',        // Muted Blue (Backgrounds)
  orange: '#F2994A',         // Liability/Warning
  purple: '#BB6BD9',         // Transfer

  // Standard
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const

// === IVY PALETTE (Original) ===
export const IvyPalette = {
  white: '#FAFAFC',
  extraLightGray: '#EBEBF0',
  lightGray: '#CBCBD6',
  gray: '#74747A',
  darkGray: '#303033',
  extraDarkGray: '#1C1C1F',
  black: '#09090A',
  trueBlack: '#000000',
  pureWhite: '#FFFFFF',

  purple: '#5C3DF5',
  purpleLight: '#9987F5',
  purpleDark: '#36248F',
  purpleExtraLight: '#B8ABF5',

  green: '#12B880',
  greenLight: '#5AE0B4',
  greenDark: '#0C7A56',
  greenExtraLight: '#ABF5DC',

  red: '#F53D3D',
  redLight: '#F5AB87',
  redDark: '#8F2424',
  redExtraLight: '#F5ABAB',

  orange: '#F57A3D',
  orangeLight: '#F5AB87',
  orangeDark: '#8F4724',

  blue: '#3193F5',
  blueLight: '#87BEF5',
  blueDark: '#24598F',
  blueExtraLight: '#D6EAF8', // Added for badge backgrounds

  yellow: '#F5D018',
} as const

// Backwards compatibility for now (though we should migrate away from direct Palette usage)
// We alias Palette to DeepSpacePalette as it is the current default
export const Palette = DeepSpacePalette;


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
  assetLight: string
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
  onPrimary: string
}

// === SEMANTIC THEME DEFINITIONS ===

const DeepSpaceTheme: { light: Theme; dark: Theme } = {
  light: {
    primary: DeepSpacePalette.mint,
    primaryLight: DeepSpacePalette.mintDim,
    success: DeepSpacePalette.mint,
    successLight: DeepSpacePalette.mintDim,
    warning: DeepSpacePalette.orange,
    warningLight: '#FFF5E5',
    error: DeepSpacePalette.red,
    errorLight: '#FFE5E5',
    asset: DeepSpacePalette.blue,
    assetLight: '#E8F2FF', // Light blue for light mode
    liability: DeepSpacePalette.orange,
    equity: DeepSpacePalette.mint,
    income: DeepSpacePalette.mint,
    expense: DeepSpacePalette.red,
    transfer: DeepSpacePalette.purple,
    background: '#F5F5FA',
    surface: '#FFFFFF',
    surfaceSecondary: '#EBEBF0',
    border: '#E1E1E6',
    text: '#1A1A1E',
    textSecondary: '#6E6E73',
    textTertiary: '#9E9EA3',
    icon: '#6E6E73',
    overlay: 'rgba(10, 10, 12, 0.5)',
    divider: '#E1E1E6',
    pure: '#FFFFFF',
    pureInverse: '#000000',
    onPrimary: '#0A0A0C',
  },
  dark: {
    primary: DeepSpacePalette.mint,
    primaryLight: DeepSpacePalette.mintDim,
    success: DeepSpacePalette.mint,
    successLight: DeepSpacePalette.mintDim,
    warning: DeepSpacePalette.orange,
    warningLight: '#3D2A1A',
    error: DeepSpacePalette.red,
    errorLight: '#3D1A1A',
    asset: DeepSpacePalette.blue,
    assetLight: DeepSpacePalette.blueDim, // Dark blue for dark mode
    liability: DeepSpacePalette.orange,
    equity: DeepSpacePalette.mint,
    income: DeepSpacePalette.mint,
    expense: DeepSpacePalette.red,
    transfer: DeepSpacePalette.purple,
    background: DeepSpacePalette.background,
    surface: DeepSpacePalette.surface,
    surfaceSecondary: DeepSpacePalette.surfaceHighlight,
    border: DeepSpacePalette.surfaceHighlight,
    text: DeepSpacePalette.textPrimary,
    textSecondary: DeepSpacePalette.textSecondary,
    textTertiary: '#5A5666',
    icon: DeepSpacePalette.textSecondary,
    overlay: 'rgba(0, 0, 0, 0.7)',
    divider: DeepSpacePalette.surfaceHighlight,
    pure: '#000000',
    pureInverse: '#FFFFFF',
    onPrimary: '#0A0A0C',
  },
};

const IvyTheme: { light: Theme; dark: Theme } = {
  light: {
    primary: IvyPalette.purple,
    primaryLight: IvyPalette.purpleExtraLight,
    success: IvyPalette.green,
    successLight: IvyPalette.greenExtraLight,
    warning: IvyPalette.orange,
    warningLight: '#FFE8D6',
    error: IvyPalette.red,
    errorLight: IvyPalette.redExtraLight,
    asset: IvyPalette.blue,
    assetLight: IvyPalette.blueExtraLight,
    liability: IvyPalette.orange,
    equity: IvyPalette.green,
    income: IvyPalette.green,
    expense: IvyPalette.red,
    transfer: IvyPalette.purple,
    background: IvyPalette.white,
    surface: IvyPalette.white,
    surfaceSecondary: IvyPalette.extraLightGray,
    border: IvyPalette.extraLightGray,
    text: IvyPalette.black,
    textSecondary: IvyPalette.gray,
    textTertiary: IvyPalette.lightGray,
    icon: IvyPalette.gray,
    overlay: 'rgba(9, 9, 10, 0.5)',
    divider: IvyPalette.extraLightGray,
    pure: '#FFFFFF',
    pureInverse: '#000000',
    onPrimary: '#FFFFFF',
  },
  dark: {
    primary: IvyPalette.purple,
    primaryLight: IvyPalette.purpleDark,
    success: IvyPalette.green,
    successLight: IvyPalette.greenDark,
    warning: IvyPalette.orange,
    warningLight: IvyPalette.orangeDark,
    error: IvyPalette.red,
    errorLight: IvyPalette.redDark,
    asset: IvyPalette.blue,
    assetLight: IvyPalette.blueDark, // Or maybe a more muted dark blue? blueDark is good.
    liability: IvyPalette.orange,
    equity: IvyPalette.green,
    income: IvyPalette.green,
    expense: IvyPalette.red,
    transfer: IvyPalette.purple,
    background: IvyPalette.black,
    surface: IvyPalette.extraDarkGray,
    surfaceSecondary: '#25252A',
    border: IvyPalette.darkGray,
    text: IvyPalette.white,
    textSecondary: IvyPalette.lightGray,
    textTertiary: IvyPalette.gray,
    icon: IvyPalette.lightGray,
    overlay: 'rgba(0, 0, 0, 0.8)',
    divider: IvyPalette.darkGray,
    pure: '#000000',
    pureInverse: '#FFFFFF',
    onPrimary: '#FFFFFF',
  },
};

// === THEME REGISTRY ===
export const ThemeSchemes: Record<ThemeId, { light: Theme; dark: Theme }> = {
  [ThemeIds.DEEP_SPACE]: DeepSpaceTheme,
  [ThemeIds.IVY]: IvyTheme,
};

// Default export for backwards compatibility
export const Colors = DeepSpaceTheme;

// Helper to resolve theme colors
export const getThemeColors = (themeId: ThemeId, mode: ThemeMode): Theme => {
  const scheme = ThemeSchemes[themeId] || ThemeSchemes[ThemeIds.DEEP_SPACE];
  return scheme[mode];
};

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


// === LAYOUT CONSTANTS ===
// Interaction areas and component-specific dimensions
export const Layout = {
  touchTarget: {
    minHeight: 110,
    minWidth: 44,
  },
  keyboardOffset: {
    ios: 0,
    android: 20,
  },
  modal: {
    defaultHeight: '85%',
    dragHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
    },
  },
  chart: {
    donut: {
      defaultStrokeWidth: 20,
      defaultSize: 200,
    },
    line: {
      defaultHeight: 200,
      paddingVertical: 20,
      strokeWidth: 3,
    },
  },
  datePicker: {
    monthSlider: {
      initialIndex: 25,
      monthsBefore: 25,
      monthsAfter: 13,
      itemWidth: 120,
      totalMonths: 39,
    },
    maxLength: {
      lastN: 3,
    },
  },
  list: {
    estimatedItemSize: {
      transactionCard: 120,
      accountCard: 150,
      journalCard: 100,
    },
  },
  hierarchy: {
    indentWidth: 20,
    guideOffset: 10,
    parentIndicator: {
      width: 3,
      height: 32,
      marginRight: 4,
      borderRadius: 2,
    },
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    circleSize: 22,
  },
} as const

// === ANIMATION CONSTANTS ===
// Timing values for interactions
export const Animation = {
  scrollDelay: 100,
  dataRefreshDebounce: 300,
} as const

// === Z-INDEX STACK ===
// Standardized layering for the application
export const ZIndex = {
  base: 0,
  fab: 100,
  header: 200,
  overlay: 500,
  modal: 1000,
  toast: 2000,
} as const

// === TYPE DEFINITIONS ===

export type ThemeMode = 'light' | 'dark'
export type ColorKey = keyof Theme
export type SpacingKey = keyof typeof Spacing
export type TypographySize = keyof typeof Typography.sizes
export type RadiusKey = keyof typeof Shape.radius
export type ElevationKey = keyof typeof Shape.elevation
