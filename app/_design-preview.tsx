/**
 * Design Preview - Living visual reference for the design system
 * Your visual truth, regression detector, and Ivy-ish check
 * 
 * ========================================
 * RULES FOR THIS FILE:
 * ========================================
 * - No imports from app screens
 * - No business logic
 * - No state beyond theme toggling
 * - No new components created for preview convenience
 * - Only render components that are part of the design system
 * - Preview helper components must be local and not exported
 * - Must consume the design system exactly like the app does
 * - ZERO hardcoded colors or magic numbers
 * - If it looks wrong here, it is wrong everywhere
 * ========================================
 */
import {
  AppButton,
  AppCard,
  AppText,
  Badge,
  Box,
  Divider,
  ListRow,
  Stack
} from '@/components/core'
import { Shape, Spacing, ThemeMode, useThemeColors } from '@/constants'
import { ThemeOverride } from '@/contexts/UIContext'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Redirect } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, Switch, View } from 'react-native'

// Preview-only helper - demonstrates patterns, does not create new components
// This is the ONLY preview-only component allowed in this file
const TokenBox = ({ size, radius }: { size: number; radius: number }) => {
  const theme = useThemeColors()
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: theme.primary,
      }}
    />
  )
}

export default function DesignPreviewScreen() {
  // Gate this screen to development only
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />
  }

  const systemColorScheme = useColorScheme()
  const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === 'dark')
  const themeMode: ThemeMode = isDarkMode ? 'dark' : 'light'
  const theme = useThemeColors(themeMode)

  return (
    <ThemeOverride mode={themeMode}>
      <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <AppText variant="title">Design System Preview</AppText>
          <View style={styles.themeToggle}>
            <AppText variant="body">Dark Mode:</AppText>
            <Switch
              value={isDarkMode}
              onValueChange={setIsDarkMode}
            />
          </View>
        </View>

        {/* Typography Section */}
        <AppCard elevation="sm" padding="lg" style={styles.section}>
          <AppText variant="heading">Typography</AppText>
          <Divider />

          <AppText variant="hero">$12,345</AppText>
          <AppText variant="title">Title</AppText>
          <AppText variant="heading">Heading</AppText>
          <AppText variant="subheading">Subheading</AppText>
          <AppText variant="body">Body</AppText>
          <AppText variant="caption">Caption</AppText>

          <Divider />

          <AppText variant="body" color="primary">Primary Text</AppText>
          <AppText variant="body" color="secondary">Secondary Text</AppText>
          <AppText variant="body" color="tertiary">Tertiary Text</AppText>

          <AppText variant="body" color="success">Success</AppText>
          <AppText variant="body" color="warning">Warning</AppText>
          <AppText variant="body" color="error">Error</AppText>

          <AppText variant="body" color="asset">Asset</AppText>
          <AppText variant="body" color="liability">Liability</AppText>
          <AppText variant="body" color="equity">Equity</AppText>
          <AppText variant="body" color="income">Income</AppText>
          <AppText variant="body" color="expense">Expense</AppText>
        </AppCard>

        {/* Layout Primitives Section */}
        <AppCard elevation="sm" padding="lg" style={styles.section}>
          <AppText variant="heading">Layout Primitives</AppText>
          <Divider />

          <AppText variant="subheading">Stack (Vertical, gap: md)</AppText>
          <Box style={{ backgroundColor: theme.surfaceSecondary, padding: Spacing.md, borderRadius: Shape.radius.md }}>
            <Stack space="md">
              <AppCard elevation="none" padding="sm"><AppText variant="caption">Item 1</AppText></AppCard>
              <AppCard elevation="none" padding="sm"><AppText variant="caption">Item 2</AppText></AppCard>
              <AppCard elevation="none" padding="sm"><AppText variant="caption">Item 3</AppText></AppCard>
            </Stack>
          </Box>

          <AppText variant="subheading" style={{ marginTop: Spacing.md }}>Stack (Horizontal, gap: lg)</AppText>
          <Box style={{ backgroundColor: theme.surfaceSecondary, padding: Spacing.md, borderRadius: Shape.radius.md }}>
            <Stack horizontal space="lg">
              <TokenBox size={40} radius={Shape.radius.sm} />
              <TokenBox size={40} radius={Shape.radius.sm} />
              <TokenBox size={40} radius={Shape.radius.sm} />
            </Stack>
          </Box>
        </AppCard>

        {/* Buttons Section */}
        <AppCard elevation="sm" padding="lg" style={styles.section}>
          <AppText variant="heading">Buttons</AppText>
          <Divider />

          <View style={styles.buttonRow}>
            <AppButton variant="primary">
              Primary
            </AppButton>
            <AppButton variant="secondary">
              Secondary
            </AppButton>
            <AppButton variant="outline">
              Outline
            </AppButton>
          </View>

          <View style={styles.buttonRow}>
            <AppButton variant="primary" loading>
              Loading
            </AppButton>
            <AppButton variant="secondary" disabled>
              Disabled
            </AppButton>
          </View>
        </AppCard>

        {/* Badges Section */}
        <AppCard elevation="sm" padding="lg" style={styles.section}>
          <AppText variant="heading">Badges</AppText>
          <Divider />

          <View style={styles.badgeRow}>
            <Badge variant="default">Default</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="error">Error</Badge>
          </View>

          <View style={styles.badgeRow}>
            <Badge variant="asset">ASSET</Badge>
            <Badge variant="liability">LIABILITY</Badge>
            <Badge variant="income">INCOME</Badge>
            <Badge variant="expense">EXPENSE</Badge>
          </View>
        </AppCard>

        {/* List Rows Section */}
        <AppCard elevation="sm" padding="lg" style={styles.section}>
          <AppText variant="heading">List Rows</AppText>
          <Divider />

          <ListRow
            title="Simple Row"
            subtitle="Just a title and subtitle"
          />

          <ListRow
            title="Row with Badge"
            subtitle="Account type badge"
            trailing={<Badge variant="asset">ASSET</Badge>}
            showDivider
          />

          <ListRow
            title="Clickable Row"
            subtitle="Tap this row"
            trailing={<Badge variant="income">+$500</Badge>}
            showDivider
            onPress={() => { }}
          />

          <ListRow
            title="Row with Leading Icon"
            subtitle="Custom leading content"
            leading={<TokenBox size={Spacing.lg} radius={Shape.radius.lg} />}
            trailing={<AppText variant="body" color="secondary">→</AppText>}
            showDivider
          />
        </AppCard>

        {/* Dividers Section */}
        <AppCard elevation="sm" padding="lg" style={styles.section}>
          <AppText variant="heading">Dividers</AppText>
          <Divider />

          <AppText variant="body">Horizontal dividers:</AppText>
          <View style={{
            marginVertical: Spacing.md,
            backgroundColor: theme.surfaceSecondary,
            padding: Spacing.sm,
            borderRadius: Shape.radius.md,
          }}>
            <Divider orientation="horizontal" thickness="thin" length="full" />
          </View>
          <View style={{
            marginVertical: Spacing.md,
            backgroundColor: theme.surfaceSecondary,
            padding: Spacing.sm,
            borderRadius: Shape.radius.md,
          }}>
            <Divider orientation="horizontal" thickness="medium" length="full" />
          </View>

          <AppText variant="body">Vertical dividers:</AppText>
          <View style={styles.verticalDividerContainer}>
            <TokenBox size={Spacing.lg} radius={Shape.radius.sm} />
            <Divider orientation="vertical" thickness="thin" length={Spacing.xl} />
            <TokenBox size={Spacing.lg} radius={Shape.radius.sm} />
            <Divider orientation="vertical" thickness="medium" length={Spacing.xl} />
            <TokenBox size={Spacing.lg} radius={Shape.radius.sm} />
          </View>
        </AppCard>

        {/* Spacing Reference */}
        <AppCard elevation="sm" padding="lg" style={styles.section}>
          <AppText variant="heading">Spacing Scale</AppText>
          <Divider />

          <AppText variant="body">4px grid system:</AppText>
          {Object.entries(Spacing).map(([key, value]) => (
            <View key={key} style={styles.spacingRow}>
              <AppText variant="caption" color="secondary" style={styles.spacingLabel}>
                {key}: {value}px
              </AppText>
              <TokenBox size={value as number} radius={Shape.radius.sm} />
            </View>
          ))}
        </AppCard>

        <View style={styles.footer}>
          <AppText variant="caption" color="tertiary">
            This is your visual truth. If it looks wrong here, it's wrong everywhere.
          </AppText>
        </View>
      </ScrollView>
    </ThemeOverride>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  section: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  cardExample: {
    marginBottom: Spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
  },
  verticalDividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.md,
  },
  spacingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  spacingLabel: {
    width: Spacing.xxxl,
  },
  footer: {
    padding: Spacing.xxxl,
    alignItems: 'center',
  },
})
