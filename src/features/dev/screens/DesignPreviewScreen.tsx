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
import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { AppButton, AppCard, AppText, Badge, AppIcon } from '@/src/components/core';
import { ListRow } from '@/src/components/core/ListRow';
import { Shape, Spacing, ThemeMode } from '@/src/constants';
import { ThemeOverride } from '@/src/contexts/UIContext';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { PeriodFilter } from '@/src/utils/dateUtils';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Switch, StyleSheet } from 'react-native';
import { Box, Inline, Inset, Page, Stack, Separator } from '@/src/design-system';

// Preview-only helper - demonstrates patterns, does not create new components
// This is the ONLY preview-only component allowed in this file
const TokenBox = ({ size, radius }: { size: number; radius: number }) => {
  return <Box width={size} height={size} borderRadius={radius} background="primary" />;
};

export default function DesignPreviewScreen() {
  const systemColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === 'dark');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>({ type: 'ALL_TIME' });
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const themeMode: ThemeMode = isDarkMode ? 'dark' : 'light';

  // Gate this screen to development only
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <ThemeOverride mode={themeMode}>
      <Page
        scrollable
        background="background"
        header={
          <Inset horizontal="lg" vertical="md">
            <Inline justifyContent="space-between" alignItems="center">
              <AppText variant="title">Design System Preview</AppText>
              <Inline space="sm" alignItems="center">
                <AppText variant="body">Dark Mode:</AppText>
                <Switch value={isDarkMode} onValueChange={setIsDarkMode} />
              </Inline>
            </Inline>
          </Inset>
        }
      >
        <Inset horizontal="lg" vertical="xl">
          <Stack space="xl">
            {/* Typography Section */}
            <AppCard elevation="sm" padding="lg">
              <Stack space="md">
                <AppText variant="heading">Typography</AppText>
                <Separator />

                <AppText variant="hero">$12,345</AppText>
                <AppText variant="title">Title</AppText>
                <AppText variant="heading">Heading</AppText>
                <AppText variant="subheading">Subheading</AppText>
                <AppText variant="body">Body</AppText>
                <AppText variant="caption">Caption</AppText>

                <Separator />

                <AppText variant="body" color="primary">
                  Primary Text
                </AppText>
                <AppText variant="body" color="secondary">
                  Secondary Text
                </AppText>
                <AppText variant="body" color="tertiary">
                  Tertiary Text
                </AppText>

                <AppText variant="body" color="success">
                  Success
                </AppText>
                <AppText variant="body" color="warning">
                  Warning
                </AppText>
                <AppText variant="body" color="error">
                  Error
                </AppText>

                <AppText variant="body" color="asset">
                  Asset
                </AppText>
                <AppText variant="body" color="liability">
                  Liability
                </AppText>
                <AppText variant="body" color="equity">
                  Equity
                </AppText>
                <AppText variant="body" color="income">
                  Income
                </AppText>
                <AppText variant="body" color="expense">
                  Expense
                </AppText>
              </Stack>
            </AppCard>

            {/* Layout Primitives Section */}
            <AppCard elevation="sm" padding="lg">
              <Stack space="md">
                <AppText variant="heading">Layout Primitives</AppText>
                <Separator />

                <AppText variant="subheading">Stack (Vertical, gap: md)</AppText>
                <Box background="surfaceSecondary" padding="md" borderRadius="md">
                  <Stack space="md">
                    <AppCard elevation="none" padding="sm">
                      <AppText variant="caption">Item 1</AppText>
                    </AppCard>
                    <AppCard elevation="none" padding="sm">
                      <AppText variant="caption">Item 2</AppText>
                    </AppCard>
                    <AppCard elevation="none" padding="sm">
                      <AppText variant="caption">Item 3</AppText>
                    </AppCard>
                  </Stack>
                </Box>

                <AppText variant="subheading">Inline (Horizontal, gap: lg)</AppText>
                <Box background="surfaceSecondary" padding="md" borderRadius="md">
                  <Inline space="lg">
                    <TokenBox size={40} radius={Shape.radius.sm} />
                    <TokenBox size={40} radius={Shape.radius.sm} />
                    <TokenBox size={40} radius={Shape.radius.sm} />
                  </Inline>
                </Box>
              </Stack>
            </AppCard>

            {/* Buttons Section */}
            <AppCard elevation="sm" padding="lg">
              <Stack space="md">
                <AppText variant="heading">Buttons</AppText>
                <Separator />

                <Inline space="md" flexWrap="wrap">
                  <AppButton variant="primary">Primary</AppButton>
                  <AppButton variant="secondary">Secondary</AppButton>
                  <AppButton variant="outline">Outline</AppButton>
                </Inline>

                <Inline space="md">
                  <AppButton variant="primary" loading>
                    Loading
                  </AppButton>
                  <AppButton variant="secondary" disabled>
                    Disabled
                  </AppButton>
                </Inline>
              </Stack>
            </AppCard>

            {/* Badges Section */}
            <AppCard elevation="sm" padding="lg">
              <Stack space="md">
                <AppText variant="heading">Badges</AppText>
                <Separator />

                <Inline space="sm" flexWrap="wrap">
                  <Badge variant="default">Default</Badge>
                  <Badge variant="success">Success</Badge>
                  <Badge variant="warning">Warning</Badge>
                  <Badge variant="error">Error</Badge>
                </Inline>

                <Inline space="sm" flexWrap="wrap">
                  <Badge variant="asset">ASSET</Badge>
                  <Badge variant="liability">LIABILITY</Badge>
                  <Badge variant="income">INCOME</Badge>
                  <Badge variant="expense">EXPENSE</Badge>
                </Inline>
              </Stack>
            </AppCard>

            {/* List Rows Section */}
            <AppCard elevation="sm" padding="lg">
              <Stack space="md">
                <AppText variant="heading">List Rows</AppText>
                <Separator />

                <Stack>
                  <ListRow title="Simple Row" subtitle="Just a title and subtitle" />
                  <Separator />
                  <ListRow
                    title="Row with Badge"
                    subtitle="Account type badge"
                    trailing={<Badge variant="asset">ASSET</Badge>}
                  />
                  <Separator />
                  <ListRow
                    title="Clickable Row"
                    subtitle="Tap this row"
                    trailing={<Badge variant="income">+$500</Badge>}
                    onPress={() => {}}
                  />
                  <Separator />
                  <ListRow
                    title="Row with Leading Icon"
                    subtitle="Custom leading content"
                    leading={<TokenBox size={Spacing.lg} radius={Shape.radius.lg} />}
                    trailing={<AppIcon name="chevronRight" size={14} />}
                  />
                </Stack>
              </Stack>
            </AppCard>

            {/* Separators Section */}
            <AppCard elevation="sm" padding="lg">
              <Stack space="md">
                <AppText variant="heading">Separators</AppText>
                <Separator />

                <AppText variant="body">Horizontal:</AppText>
                <Box background="surfaceSecondary" padding="sm" borderRadius="md">
                  <Separator space={1} />
                </Box>
                <Box background="surfaceSecondary" padding="sm" borderRadius="md">
                  <Separator space={2} />
                </Box>

                <AppText variant="body">Vertical:</AppText>
                <Box background="surfaceSecondary" padding="md" borderRadius="md">
                  <Inline space="sm" alignItems="center">
                    <TokenBox size={Spacing.lg} radius={Shape.radius.sm} />
                    <Separator vertical space={1} height={Spacing.xl} />
                    <TokenBox size={Spacing.lg} radius={Shape.radius.sm} />
                    <Separator vertical space={2} height={Spacing.xl} />
                    <TokenBox size={Spacing.lg} radius={Shape.radius.sm} />
                  </Inline>
                </Box>
              </Stack>
            </AppCard>

            {/* Spacing Reference */}
            <AppCard elevation="sm" padding="lg">
              <Stack space="md">
                <AppText variant="heading">Spacing Scale</AppText>
                <Separator />

                <AppText variant="body">4px grid system:</AppText>
                {Object.entries(Spacing)
                  .filter(([key]) => typeof Spacing[key as keyof typeof Spacing] === 'number')
                  .map(([key, value]) => (
                    <Inline key={key} space="md" alignItems="center">
                      <AppText variant="caption" color="secondary" style={styles.spacingLabel}>
                        {key}: {value}px
                      </AppText>
                      <TokenBox size={value as number} radius={Shape.radius.sm} />
                    </Inline>
                  ))}
              </Stack>
            </AppCard>

            <Box alignItems="center" paddingVertical="xl">
              <AppText variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
                This is your visual truth. If it looks wrong here, it&apos;s wrong everywhere.
              </AppText>
            </Box>
          </Stack>
        </Inset>

        <DateRangePicker
          visible={isDatePickerVisible}
          onClose={() => setIsDatePickerVisible(false)}
          currentFilter={periodFilter}
          onSelect={(_range, filter) => {
            setPeriodFilter(filter);
            setIsDatePickerVisible(false);
          }}
        />
      </Page>
    </ThemeOverride>
  );
}

const styles = StyleSheet.create({
  spacingLabel: {
    width: 80,
  },
});
