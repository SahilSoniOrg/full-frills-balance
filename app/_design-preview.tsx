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
  AppInput,
  AppText,
  Badge,
  Box,
  Divider,
  ListRow,
  Stack
} from '@/components/core'
import { Shape, Spacing, ThemeMode, useThemeColors } from '@/constants'
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
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <AppText variant="title" themeMode={themeMode}>Design System Preview</AppText>
        <View style={styles.themeToggle}>
          <AppText variant="body" themeMode={themeMode}>Dark Mode:</AppText>
          <Switch
            value={isDarkMode}
            onValueChange={setIsDarkMode}
          />
        </View>
      </View>

      {/* Typography Section */}
      <AppCard elevation="sm" padding="lg" style={styles.section} themeMode={themeMode}>
        <AppText variant="heading" themeMode={themeMode}>Typography</AppText>
        <Divider themeMode={themeMode} />

        <AppText variant="hero" themeMode={themeMode}>$12,345</AppText>
        <AppText variant="title" themeMode={themeMode}>Title</AppText>
        <AppText variant="heading" themeMode={themeMode}>Heading</AppText>
        <AppText variant="subheading" themeMode={themeMode}>Subheading</AppText>
        <AppText variant="body" themeMode={themeMode}>Body</AppText>
        <AppText variant="caption" themeMode={themeMode}>Caption</AppText>

        <Divider themeMode={themeMode} />

        <AppText variant="body" color="primary" themeMode={themeMode}>Primary Text</AppText>
        <AppText variant="body" color="secondary" themeMode={themeMode}>Secondary Text</AppText>
        <AppText variant="body" color="tertiary" themeMode={themeMode}>Tertiary Text</AppText>

        <AppText variant="body" color="success" themeMode={themeMode}>Success</AppText>
        <AppText variant="body" color="warning" themeMode={themeMode}>Warning</AppText>
        <AppText variant="body" color="error" themeMode={themeMode}>Error</AppText>

        <AppText variant="body" color="asset" themeMode={themeMode}>Asset</AppText>
        <AppText variant="body" color="liability" themeMode={themeMode}>Liability</AppText>
        <AppText variant="body" color="equity" themeMode={themeMode}>Equity</AppText>
        <AppText variant="body" color="income" themeMode={themeMode}>Income</AppText>
        <AppText variant="body" color="expense" themeMode={themeMode}>Expense</AppText>
      </AppCard>

      {/* Layout Primitives Section */}
      <AppCard elevation="sm" padding="lg" style={styles.section} themeMode={themeMode}>
        <AppText variant="heading" themeMode={themeMode}>Layout Primitives</AppText>
        <Divider themeMode={themeMode} />

        <AppText variant="subheading" themeMode={themeMode}>Stack (Vertical, gap: md)</AppText>
        <Box style={{ backgroundColor: theme.surfaceSecondary, padding: Spacing.md, borderRadius: Shape.radius.md }}>
          <Stack space="md">
            <AppCard elevation="none" padding="sm" themeMode={themeMode}><AppText variant="caption">Item 1</AppText></AppCard>
            <AppCard elevation="none" padding="sm" themeMode={themeMode}><AppText variant="caption">Item 2</AppText></AppCard>
            <AppCard elevation="none" padding="sm" themeMode={themeMode}><AppText variant="caption">Item 3</AppText></AppCard>
          </Stack>
        </Box>

        <AppText variant="subheading" style={{ marginTop: Spacing.md }} themeMode={themeMode}>Stack (Horizontal, gap: lg)</AppText>
        <Box style={{ backgroundColor: theme.surfaceSecondary, padding: Spacing.md, borderRadius: Shape.radius.md }}>
          <Stack horizontal space="lg">
            <TokenBox size={40} radius={Shape.radius.sm} />
            <TokenBox size={40} radius={Shape.radius.sm} />
            <TokenBox size={40} radius={Shape.radius.sm} />
          </Stack>
        </Box>
      </AppCard>

      {/* Inputs Section */}
      <AppCard elevation="sm" padding="lg" style={styles.section} themeMode={themeMode}>
        <AppText variant="heading" themeMode={themeMode}>Inputs</AppText>
        <Divider themeMode={themeMode} />

        <Stack space="md">
          <AppInput label="Default Variant" placeholder="Type here..." themeMode={themeMode} />
          <AppInput variant="hero" value="1,200.00" themeMode={themeMode} />
          <Box padding="md" backgroundColor={theme.surfaceSecondary} borderRadius={Shape.radius.md}>
            <AppInput variant="minimal" placeholder="Minimal variant" themeMode={themeMode} />
          </Box>
        </Stack>
      </AppCard>
      <AppCard elevation="sm" padding="lg" style={styles.section} themeMode={themeMode}>
        <AppText variant="heading" themeMode={themeMode}>Cards</AppText>
        <Divider themeMode={themeMode} />

        <AppCard elevation="none" padding="md" style={styles.cardExample} themeMode={themeMode}>
          <AppText variant="body" themeMode={themeMode}>No elevation</AppText>
        </AppCard>

        <AppCard elevation="sm" padding="md" style={styles.cardExample} themeMode={themeMode}>
          <AppText variant="body" themeMode={themeMode}>Small elevation</AppText>
        </AppCard>

        <AppCard elevation="md" padding="md" style={styles.cardExample} themeMode={themeMode}>
          <AppText variant="body" themeMode={themeMode}>Medium elevation</AppText>
        </AppCard>

        <AppCard elevation="lg" padding="md" style={styles.cardExample} themeMode={themeMode}>
          <AppText variant="body" themeMode={themeMode}>Large elevation</AppText>
        </AppCard>

        <AppCard variant="secondary" elevation="sm" padding="md" style={styles.cardExample} themeMode={themeMode}>
          <AppText variant="body" themeMode={themeMode}>Secondary variant</AppText>
        </AppCard>
      </AppCard>

      {/* Buttons Section */}
      <AppCard elevation="sm" padding="lg" style={styles.section} themeMode={themeMode}>
        <AppText variant="heading" themeMode={themeMode}>Buttons</AppText>
        <Divider themeMode={themeMode} />

        <View style={styles.buttonRow}>
          <AppButton variant="primary" themeMode={themeMode}>
            Primary
          </AppButton>
          <AppButton variant="secondary" themeMode={themeMode}>
            Secondary
          </AppButton>
          <AppButton variant="outline" themeMode={themeMode}>
            Outline
          </AppButton>
        </View>

        <View style={styles.buttonRow}>
          <AppButton variant="primary" loading themeMode={themeMode}>
            Loading
          </AppButton>
          <AppButton variant="secondary" disabled themeMode={themeMode}>
            Disabled
          </AppButton>
        </View>
      </AppCard>

      {/* Badges Section */}
      <AppCard elevation="sm" padding="lg" style={styles.section} themeMode={themeMode}>
        <AppText variant="heading" themeMode={themeMode}>Badges</AppText>
        <Divider themeMode={themeMode} />

        <View style={styles.badgeRow}>
          <Badge variant="default" themeMode={themeMode}>Default</Badge>
          <Badge variant="success" themeMode={themeMode}>Success</Badge>
          <Badge variant="warning" themeMode={themeMode}>Warning</Badge>
          <Badge variant="error" themeMode={themeMode}>Error</Badge>
        </View>

        <View style={styles.badgeRow}>
          <Badge variant="asset" themeMode={themeMode}>ASSET</Badge>
          <Badge variant="liability" themeMode={themeMode}>LIABILITY</Badge>
          <Badge variant="income" themeMode={themeMode}>INCOME</Badge>
          <Badge variant="expense" themeMode={themeMode}>EXPENSE</Badge>
        </View>
      </AppCard>

      {/* List Rows Section */}
      <AppCard elevation="sm" padding="lg" style={styles.section} themeMode={themeMode}>
        <AppText variant="heading" themeMode={themeMode}>List Rows</AppText>
        <Divider themeMode={themeMode} />

        <ListRow
          title="Simple Row"
          subtitle="Just a title and subtitle"
          themeMode={themeMode}
        />

        <ListRow
          title="Row with Badge"
          subtitle="Account type badge"
          trailing={<Badge variant="asset" themeMode={themeMode}>ASSET</Badge>}
          showDivider
          themeMode={themeMode}
        />

        <ListRow
          title="Clickable Row"
          subtitle="Tap this row"
          trailing={<Badge variant="income" themeMode={themeMode}>+$500</Badge>}
          showDivider
          onPress={() => { }}
          themeMode={themeMode}
        />

        <ListRow
          title="Row with Leading Icon"
          subtitle="Custom leading content"
          leading={<TokenBox size={Spacing.lg} radius={Shape.radius.lg} />}
          trailing={<AppText variant="body" color="secondary" themeMode={themeMode}>→</AppText>}
          showDivider
          themeMode={themeMode}
        />
      </AppCard>

      {/* Dividers Section */}
      <AppCard elevation="sm" padding="lg" style={styles.section} themeMode={themeMode}>
        <AppText variant="heading" themeMode={themeMode}>Dividers</AppText>
        <Divider themeMode={themeMode} />

        <AppText variant="body" themeMode={themeMode}>Horizontal dividers:</AppText>
        <View style={{
          marginVertical: Spacing.md,
          backgroundColor: theme.surfaceSecondary,
          padding: Spacing.sm,
          borderRadius: Shape.radius.md,
        }}>
          <Divider orientation="horizontal" thickness="thin" length="full" themeMode={themeMode} />
        </View>
        <View style={{
          marginVertical: Spacing.md,
          backgroundColor: theme.surfaceSecondary,
          padding: Spacing.sm,
          borderRadius: Shape.radius.md,
        }}>
          <Divider orientation="horizontal" thickness="medium" length="full" themeMode={themeMode} />
        </View>

        <AppText variant="body" themeMode={themeMode}>Vertical dividers:</AppText>
        <View style={styles.verticalDividerContainer}>
          <TokenBox size={Spacing.lg} radius={Shape.radius.sm} />
          <Divider orientation="vertical" thickness="thin" length={Spacing.xl} themeMode={themeMode} />
          <TokenBox size={Spacing.lg} radius={Shape.radius.sm} />
          <Divider orientation="vertical" thickness="medium" length={Spacing.xl} themeMode={themeMode} />
          <TokenBox size={Spacing.lg} radius={Shape.radius.sm} />
        </View>
      </AppCard>

      {/* Spacing Reference */}
      <AppCard elevation="sm" padding="lg" style={styles.section} themeMode={themeMode}>
        <AppText variant="heading" themeMode={themeMode}>Spacing Scale</AppText>
        <Divider themeMode={themeMode} />

        <AppText variant="body" themeMode={themeMode}>4px grid system:</AppText>
        {Object.entries(Spacing).map(([key, value]) => (
          <View key={key} style={styles.spacingRow}>
            <AppText variant="caption" color="secondary" style={styles.spacingLabel} themeMode={themeMode}>
              {key}: {value}px
            </AppText>
            <TokenBox size={value as number} radius={Shape.radius.sm} />
          </View>
        ))}
      </AppCard>

      <View style={styles.footer}>
        <AppText variant="caption" color="tertiary" themeMode={themeMode}>
          This is your visual truth. If it looks wrong here, it's wrong everywhere.
        </AppText>
      </View>
    </ScrollView>
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
