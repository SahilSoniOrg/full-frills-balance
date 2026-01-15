# Design System - Ivy Wallet Inspired

## Overview
Clean, opinionated design system with minimal variants and consistent visual language inspired by Ivy Wallet.

## ========================================
## DESIGN SYSTEM PRINCIPLES (BINDING)
## ========================================

### 1. Opinionated over flexible
- Components should have strong defaults
- If a prop or variant doesn't have a clear, current product use case, it should not exist
- We prefer duplication over premature abstraction

### 2. Semantic over literal
- No raw hex colors, rgba values, or ad-hoc color logic anywhere
- All colors must come from semantic tokens (e.g. surface, textSecondary, asset, expense)
- Same applies to spacing, typography, radius, elevation

### 3. Visual consistency > developer convenience
- It should be harder to do the "wrong" thing than the "right" thing
- If something feels annoying to use, that's a signal to simplify the API, not bypass it

## ========================================
## DESIGN PREVIEW SCREEN RULES
## ========================================

The design preview is the visual source of truth.

**Rules:**
- ZERO hardcoded colors or magic numbers
- It must consume the design system exactly like the app does
- No inline theme conditionals
- No "just for demo" styling shortcuts
- If it looks wrong here, it is wrong everywhere

**Purpose:**
- Visual regression detection
- Taste alignment ("does this feel Ivy-ish?")
- Sanity check for future changes

**It is NOT:**
- A Storybook
- An exhaustive prop showcase
- A playground for theoretical variants

Only combinations we actually intend to use should appear there.

## ========================================
## COMPONENT DESIGN RULES
## ========================================

Base components (AppText, AppCard, AppButton, ListRow, Badge, Divider):

- Must encode visual identity
- Must be hard to misuse
- Must stay small and strict
- No variant explosion
- No layout primitives (Stack, Box, Flex, etc.)

If a component needs more than ~5 meaningful props, it's probably wrong.

## ========================================
## MIGRATION STRATEGY
## ========================================

- New UI must use the design system
- Existing screens migrate only when touched for feature or bug work
- No mass refactors "just to migrate"
- No visual churn without user-facing benefit

## ========================================
## CHANGE POLICY
## ========================================

- Design system API is frozen for now
- No new variants, props, or tokens without a concrete use case
- Any proposed change must improve the design preview screen
- If a change can't justify itself visually, it doesn't ship

## ========================================
## DESIGN TOKENS
## ========================================

### Colors
Semantic colors with light/dark theme support:
- **Primary**: Text hierarchy (primary, secondary, tertiary)
- **Semantic**: Success, warning, error states
- **Account Types**: Asset, liability, equity, income, expense
- **Neutral**: Backgrounds, surfaces, borders

### Typography
Limited, intentional scale:
- **Caption**: 12px - Small labels, captions
- **Body**: 16px - Standard content
- **Subheading**: 18px - Section headers
- **Heading**: 20px - Card titles
- **Title**: 32px - Hero titles

### Spacing
4px grid system:
- `xs: 4px`, `sm: 8px`, `md: 12px`, `lg: 16px`, `xl: 20px`, `xxl: 24px`, `xxxl: 32px`

### Shape
Consistent radius and elevation:
- **Radius**: `sm: 4px`, `md: 8px`, `lg: 12px`, `xl: 16px`
- **Elevation**: `none`, `sm`, `md`, `lg` with subtle shadows

## ========================================
## COMPONENTS
## ========================================

### AppText
```tsx
<AppText variant="body" color="primary" weight="medium">
  Your text here
</AppText>

// Variants: caption, body, subheading, heading, title
// Colors: primary, secondary, tertiary, success, warning, error, asset, liability, equity, income, expense
// Weights: regular, medium, semibold, bold
```

### AppCard
```tsx
<AppCard elevation="md" padding="lg" radius="lg" variant="default">
  <AppText variant="heading">Card Title</AppText>
  <AppText variant="body">Card content</AppText>
</AppCard>

// Elevation: none, sm, md, lg
// Padding: none, sm, md, lg
// Radius: sm, md, lg, xl
// Variant: default, secondary
```

### AppButton
```tsx
<AppButton 
  variant="primary" 
  size="md" 
  loading={false}
  onPress={() => console.log('pressed')}
>
  Button Text
</AppButton>

// Variants: primary, secondary, outline, ghost
// Sizes: sm, md, lg
```

### ListRow
```tsx
<ListRow
  leading={<Icon name="account" />}
  title="Account Name"
  subtitle="Bank of America"
  trailing={<Badge variant="asset">ASSET</Badge>}
  showDivider
  onPress={() => navigate('/account/123')}
/>
```

### Badge
```tsx
<Badge variant="success" size="md">Active</Badge>
<Badge variant="asset" size="sm">ASSET</Badge>

// Variants: default, success, warning, error, asset, liability, equity, income, expense
// Sizes: sm, md
```

### Divider
```tsx
<Divider orientation="horizontal" thickness="thin" length="full" />
<Divider orientation="vertical" thickness="medium" length={100} />

// Orientation: horizontal, vertical
// Thickness: thin, medium
// Length: full, content, number
```

## ========================================
## USAGE GUIDELINES
## ========================================

### New Screens
- Must use design system components
- Follow semantic color naming
- Use spacing scale consistently
- No hardcoded colors or values

### Existing Screens
- Migrate opportunistically when touched
- Replace hardcoded colors with semantic colors
- Convert StyleSheet patterns to design system components

### Non-Goals
- No generic layout primitives
- No highly configurable inputs
- No premature abstractions
- No full-screen rewrites

## ========================================
## MIGRATION EXAMPLES
## ========================================

### 1. Replace hardcoded colors
```tsx
// Before
<Text style={{ color: '#007AFF' }}>Blue text</Text>

// After
<AppText color="primary">Blue text</AppText>
```

### 2. Replace cards
```tsx
// Before
<View style={[styles.card, { backgroundColor: '#fff', borderRadius: 12 }]}>

// After
<AppCard elevation="sm" padding="md" radius="lg">
```

### 3. Replace buttons
```tsx
// Before
<TouchableOpacity style={[styles.button, { backgroundColor: '#007AFF' }]}>

// After
<AppButton variant="primary" size="md">
```

## ========================================
## CONSTANTS ACCESS
## ========================================

```tsx
import { Spacing, Typography, Colors, App } from '@/constants'
```

## ========================================
## VISUAL TRUTH
## ========================================

The design preview at `/_design-preview` is your visual truth. If it looks wrong there, it's wrong everywhere. This screen is frozen and serves as the regression detector and taste alignment check for all future design system changes.
