import { DateRangePicker } from '@/src/components/filters/DateRangePicker';
import { DateRangeTrigger } from '@/src/components/filters/DateRangeTrigger';
import {
  Icon,
  AppButton,
  AppCard,
  AppIcon,
  AppInput,
  AppInputField,
  AppSegmentedControl,
  AppTabs,
  AppText,
  AppToggle,
  Badge,
  ColoredDot,
  EmptyStateView,
  FilterChipButton,
  FloatingActionButton,
  IconButton,
  InlineSearchField,
  LoadingView,
} from '@/src/components/core';
import { ListRow } from '@/src/components/core/ListRow';
import { FontId, FontIds, Shape, Size, Spacing, ThemeMode } from '@/src/constants';
import { ThemeOverride } from '@/src/contexts/UIContext';
import { Box, Inline, Page, Separator, Skeleton, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { useThemePrefs } from '@/src/hooks/useThemePrefs';
import { ensureAllFontSetsLoaded } from '@/src/utils/loadFontSet';
import { logger } from '@/src/utils/logger';
import { PeriodFilter } from '@/src/utils/dateUtils';
import { Redirect } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Switch, useColorScheme } from 'react-native';

const PREVIEW_TAB_OPTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity', badge: 3 },
] as const;

const PREVIEW_SEGMENT_OPTIONS = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month', icon: Icon.Calendar },
  { id: 'year', label: 'Year' },
] as const;

const PREVIEW_FONT_OPTIONS = [
  { id: FontIds.DEEP_SPACE, label: 'Serif & Sans' },
  { id: FontIds.IVY, label: 'Geometric' },
  { id: FontIds.EDITORIAL, label: 'Classic Serif' },
] as const;

const TokenBox = ({ size, radius }: { size: number; radius: number }) => {
  return <Box width={size} height={size} borderRadius={radius} background="primary" />;
};

function PreviewSectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AppCard elevation="sm" paddingSize="lg">
      <Stack space="md">
        <AppText variant="heading">{title}</AppText>
        <Separator />
        {children}
      </Stack>
    </AppCard>
  );
}

function SemanticColoredDots() {
  const { theme } = useTheme();
  return (
    <Inline space="lg" alignItems="center" flexWrap="wrap">
      <Inline space="xs" alignItems="center">
        <ColoredDot color={theme.asset} size={Spacing.sm} />
        <AppText variant="caption">Asset</AppText>
      </Inline>
      <Inline space="xs" alignItems="center">
        <ColoredDot color={theme.liability} size={Spacing.sm} />
        <AppText variant="caption">Liability</AppText>
      </Inline>
      <Inline space="xs" alignItems="center">
        <ColoredDot color={theme.income} size={Spacing.sm} />
        <AppText variant="caption">Income</AppText>
      </Inline>
      <Inline space="xs" alignItems="center">
        <ColoredDot color={theme.expense} size={Spacing.sm} />
        <AppText variant="caption">Expense</AppText>
      </Inline>
      <Inline space="xs" alignItems="center">
        <ColoredDot color={theme.transfer} size={Spacing.sm} />
        <AppText variant="caption">Transfer</AppText>
      </Inline>
    </Inline>
  );
}

export default function DesignPreviewScreen() {
  const systemColorScheme = useColorScheme();
  const { fontId: savedFontId } = useThemePrefs();
  const [fontId, setFontId] = useState<FontId>(savedFontId);
  const [fontsReady, setFontsReady] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === 'dark');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>({ type: 'ALL_TIME' });
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [toggleOn, setToggleOn] = useState(true);
  const [activeTab, setActiveTab] =
    useState<(typeof PREVIEW_TAB_OPTIONS)[number]['id']>('overview');
  const [activeSegment, setActiveSegment] =
    useState<(typeof PREVIEW_SEGMENT_OPTIONS)[number]['id']>('month');
  const [filterChipActive, setFilterChipActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const themeMode: ThemeMode = isDarkMode ? 'dark' : 'light';

  useEffect(() => {
    if (!__DEV__) return;
    let active = true;
    void ensureAllFontSetsLoaded()
      .then(() => {
        if (active) setFontsReady(true);
      })
      .catch(error => logger.error('[Fonts] Failed to load design preview fonts', error));
    return () => {
      active = false;
    };
  }, []);

  // Gate this screen to development only
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <ThemeOverride mode={themeMode} fontId={fontId}>
      <Page
        scrollable
        background="background"
        header={
          <Box paddingHorizontal="lg" paddingVertical="md">
            <Inline justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="sm">
              <AppText variant="xl">Design System Preview</AppText>
              <Inline space="sm" alignItems="center">
                <AppText variant="body">Dark Mode:</AppText>
                <Switch value={isDarkMode} onValueChange={setIsDarkMode} />
              </Inline>
            </Inline>
          </Box>
        }
      >
        <Box paddingHorizontal="lg" paddingVertical="xl">
          <Stack space="xl">
            {/* Typography Section */}
            <AppCard elevation="sm" paddingSize="lg">
              <Stack space="md">
                <AppText variant="heading">Typography</AppText>
                <AppSegmentedControl
                  options={PREVIEW_FONT_OPTIONS}
                  value={fontId}
                  onChange={setFontId}
                  disabled={!fontsReady}
                  size="sm"
                  flex
                />
                <Separator />

                <AppText variant="title">Your financial picture</AppText>
                <AppText variant="heading">Monthly spending</AppText>
                <AppText variant="subheading">Recent activity</AppText>
                <AppText variant="body">Balances, budgets, and transactions in one place.</AppText>
                <AppText variant="bodySmall" color="secondary">
                  After commitments over 30 days
                </AppText>
                <AppText variant="caption" color="secondary">
                  Updated today
                </AppText>
                <AppText
                  variant="hero"
                  fontRole="numeric"
                  weight="semibold"
                  tabular
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  ₹12,345
                </AppText>
                <Stack space="xs">
                  <Inline justifyContent="space-between">
                    <AppText variant="bodySmall">Income</AppText>
                    <AppText variant="bodySmall" weight="semibold" tabular>
                      ₹11,111.00
                    </AppText>
                  </Inline>
                  <Inline justifyContent="space-between">
                    <AppText variant="bodySmall">Expenses</AppText>
                    <AppText variant="bodySmall" weight="semibold" tabular>
                      ₹88,888.00
                    </AppText>
                  </Inline>
                </Stack>

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
            <AppCard elevation="sm" paddingSize="lg">
              <Stack space="md">
                <AppText variant="heading">Layout Primitives</AppText>
                <Separator />

                <AppText variant="subheading">Stack (Vertical, gap: md)</AppText>
                <Box background="surfaceSecondary" padding="md" borderRadius="md">
                  <Stack space="md">
                    <AppCard elevation="none" paddingSize="sm">
                      <AppText variant="caption">Item 1</AppText>
                    </AppCard>
                    <AppCard elevation="none" paddingSize="sm">
                      <AppText variant="caption">Item 2</AppText>
                    </AppCard>
                    <AppCard elevation="none" paddingSize="sm">
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
            <PreviewSectionCard title="Buttons">
              <AppText variant="subheading">Variants</AppText>
              <Inline space="md" flexWrap="wrap">
                <AppButton variant="primary">Primary</AppButton>
                <AppButton variant="secondary">Secondary</AppButton>
                <AppButton variant="outline">Outline</AppButton>
                <AppButton variant="ghost">Ghost</AppButton>
              </Inline>

              <AppText variant="subheading">Destructive</AppText>
              <Inline space="md" flexWrap="wrap">
                <AppButton variant="destructive">Delete</AppButton>
                <AppButton variant="destructive-outline">Remove</AppButton>
              </Inline>

              <AppText variant="subheading">Sizes</AppText>
              <Inline space="md" alignItems="center" flexWrap="wrap">
                <AppButton variant="primary" size="sm">
                  Small
                </AppButton>
                <AppButton variant="primary" size="md">
                  Medium
                </AppButton>
                <AppButton variant="primary" size="lg">
                  Large
                </AppButton>
              </Inline>

              <AppText variant="subheading">States</AppText>
              <Inline space="md" flexWrap="wrap">
                <AppButton variant="primary" loading>
                  Loading
                </AppButton>
                <AppButton variant="secondary" disabled>
                  Disabled
                </AppButton>
              </Inline>
            </PreviewSectionCard>

            {/* Badges Section */}
            <PreviewSectionCard title="Badges">
              <AppText variant="subheading">Soft</AppText>
              <Inline space="sm" flexWrap="wrap">
                <Badge variant="default">Default</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="error">Error</Badge>
              </Inline>

              <AppText variant="subheading">Accounting</AppText>
              <Inline space="sm" flexWrap="wrap">
                <Badge variant="asset">ASSET</Badge>
                <Badge variant="liability">LIABILITY</Badge>
                <Badge variant="income">INCOME</Badge>
                <Badge variant="expense">EXPENSE</Badge>
              </Inline>

              <AppText variant="subheading">Solid &amp; sizes</AppText>
              <Inline space="sm" flexWrap="wrap" alignItems="center">
                <Badge variant="primary" solid>
                  Solid
                </Badge>
                <Badge variant="success" solid size="sm">
                  Small
                </Badge>
                <Badge variant="income" icon={Icon.TrendingUp}>
                  With icon
                </Badge>
              </Inline>
            </PreviewSectionCard>

            {/* List Rows Section */}
            <AppCard elevation="sm" paddingSize="lg">
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
                    trailing={<AppIcon name={Icon.ChevronRight} size={14} />}
                  />
                </Stack>
              </Stack>
            </AppCard>

            {/* AppInput & Fields Section */}
            <PreviewSectionCard title="Inputs & Fields">
              <Stack space="lg">
                <Box>
                  <Box marginBottom="xs">
                    <AppText variant="caption" color="secondary">
                      AppInput (label + error)
                    </AppText>
                  </Box>
                  <AppInput
                    label="Account name"
                    placeholder="Checking"
                    error="Name is required"
                    leftIcon={Icon.Wallet}
                  />
                </Box>

                <Box>
                  <Box marginBottom="xs">
                    <AppText variant="caption" color="secondary">
                      Default field
                    </AppText>
                  </Box>
                  <AppInputField placeholder="Search..." leftIcon={Icon.Search} />
                </Box>

                <Box>
                  <Box marginBottom="xs">
                    <AppText variant="caption" color="secondary">
                      Hero variant
                    </AppText>
                  </Box>
                  <AppInputField variant="hero" placeholder="0" keyboardType="numeric" />
                </Box>

                <Box>
                  <Box marginBottom="xs">
                    <AppText variant="caption" color="secondary">
                      Minimal variant
                    </AppText>
                  </Box>
                  <AppInputField variant="minimal" placeholder="Add note..." />
                </Box>
              </Stack>
            </PreviewSectionCard>

            {/* Cards & surfaces */}
            <PreviewSectionCard title="Cards & Surfaces">
              <Stack space="md">
                <AppCard variant="default" paddingSize="md">
                  <AppText variant="body">Default card</AppText>
                </AppCard>
                <AppCard variant="secondary" paddingSize="md">
                  <AppText variant="body">Secondary card</AppText>
                </AppCard>
                <AppCard variant="outline" paddingSize="md">
                  <AppText variant="body">Outline card</AppText>
                </AppCard>
                <AppCard variant="ghost" paddingSize="md">
                  <AppText variant="body" color="primary">
                    Ghost card
                  </AppText>
                </AppCard>
                <AppCard overflow="visible" padding="lg" elevation="md">
                  <AppText variant="caption" color="secondary">
                    AppCard (elevation md)
                  </AppText>
                </AppCard>
              </Stack>
            </PreviewSectionCard>

            {/* Icon buttons & FAB */}
            <PreviewSectionCard title="Icon Buttons & FAB">
              <AppText variant="subheading">IconButton</AppText>
              <Inline space="md" flexWrap="wrap" alignItems="center">
                <IconButton name={Icon.Settings} variant="surface" accessibilityLabel="Settings" />
                <IconButton name={Icon.Add} variant="primary" accessibilityLabel="Add" />
                <IconButton name={Icon.Close} variant="clear" accessibilityLabel="Close" />
                <IconButton name={Icon.Delete} variant="error" accessibilityLabel="Delete" />
                <IconButton name={Icon.Check} variant="success" accessibilityLabel="Confirm" />
                <IconButton
                  name={Icon.Settings}
                  variant="surface"
                  disabled
                  accessibilityLabel="Disabled"
                />
              </Inline>

              <AppText variant="subheading">Floating action button</AppText>
              <Box position="relative" minHeight={Size.fab + Spacing.xxl} width="100%">
                <Inline space="lg" alignItems="center">
                  <FloatingActionButton
                    onPress={() => {}}
                    style={{ position: 'relative', bottom: undefined, right: undefined }}
                    accessibilityLabel="Add transaction"
                  />
                  <FloatingActionButton
                    onPress={() => {}}
                    label="Log"
                    icon={Icon.Add}
                    style={{ position: 'relative', bottom: undefined, right: undefined }}
                  />
                </Inline>
              </Box>
            </PreviewSectionCard>

            {/* Navigation controls */}
            <PreviewSectionCard title="Tabs, Segments & Chips">
              <Stack space="lg">
                <Box marginHorizontal={-Spacing.lg}>
                  <AppTabs
                    options={PREVIEW_TAB_OPTIONS}
                    value={activeTab}
                    onChange={setActiveTab}
                    testID="design-preview-tabs"
                  />
                </Box>

                <AppSegmentedControl
                  options={PREVIEW_SEGMENT_OPTIONS}
                  value={activeSegment}
                  onChange={setActiveSegment}
                  testID="design-preview-segment"
                />

                <Inline space="sm" flexWrap="wrap">
                  <FilterChipButton
                    label="All"
                    icon={Icon.Filter}
                    isActive={filterChipActive}
                    onPress={() => setFilterChipActive(true)}
                  />
                  <FilterChipButton
                    label="Expenses"
                    icon={Icon.TrendingDown}
                    isActive={!filterChipActive}
                    onPress={() => setFilterChipActive(false)}
                  />
                </Inline>

                <Inline space="md" alignItems="center">
                  <AppText variant="body">AppToggle</AppText>
                  <AppToggle value={toggleOn} onValueChange={setToggleOn} />
                  <AppToggle value={false} onValueChange={() => {}} disabled />
                </Inline>
              </Stack>
            </PreviewSectionCard>

            {/* Icons & indicators */}
            <PreviewSectionCard title="Icons & Indicators">
              <AppText variant="subheading">AppIcon</AppText>
              <Inline space="lg" alignItems="center" flexWrap="wrap">
                <AppIcon name={Icon.Wallet} size={Size.iconMd} />
                <AppIcon name={Icon.Calendar} size={Size.iconMd} color="primary" />
                <AppIcon name={Icon.TrendingUp} size={Size.iconMd} color="income" />
                <AppIcon name={Icon.TrendingDown} size={Size.iconMd} color="expense" />
                <AppIcon name={Icon.ChevronRight} size={Size.iconSm} color="textSecondary" />
              </Inline>

              <AppText variant="subheading">ColoredDot (semantic)</AppText>
              <SemanticColoredDots />
            </PreviewSectionCard>

            {/* Feedback & loading */}
            <PreviewSectionCard title="Loading & Empty States">
              <Stack space="lg">
                <Box minHeight={Size.xxl * 2} justifyContent="center">
                  <LoadingView loading text="Loading accounts…" />
                </Box>

                <Box minHeight={Size.xxl * 4}>
                  <EmptyStateView
                    title="No transactions yet"
                    subtitle="Log your first entry to see activity here."
                    icon={Icon.Receipt}
                    primaryActionLabel="Log transaction"
                    onPrimaryAction={() => {}}
                    style={{ flex: 0 }}
                  />
                </Box>

                <AppText variant="subheading">Skeleton</AppText>
                <Stack space="sm">
                  <Skeleton height={Spacing.lg} radius="sm" />
                  <Skeleton height={Spacing.lg} width="80%" radius="sm" />
                  <Skeleton height={Size.avatarMd} width={Size.avatarMd} radius="full" />
                </Stack>
              </Stack>
            </PreviewSectionCard>

            {/* Search */}
            <PreviewSectionCard title="Search">
              <InlineSearchField value={searchQuery} onChangeText={setSearchQuery} />
            </PreviewSectionCard>

            {/* Date range */}
            <PreviewSectionCard title="Date Range">
              <DateRangeTrigger
                label="All time"
                onPress={() => setIsDatePickerVisible(true)}
                onPrevious={() => {}}
                onNext={() => {}}
              />
            </PreviewSectionCard>

            {/* Shape tokens */}
            <PreviewSectionCard title="Shape Tokens">
              <AppText variant="subheading">Radius scale</AppText>
              <Inline space="md" alignItems="center" flexWrap="wrap">
                <TokenBox size={Size.xl} radius={Shape.radius.xs} />
                <TokenBox size={Size.xl} radius={Shape.radius.r4} />
                <TokenBox size={Size.xl} radius={Shape.radius.r3} />
                <TokenBox size={Size.xl} radius={Shape.radius.r2} />
                <TokenBox size={Size.xl} radius={Shape.radius.r1} />
                <TokenBox size={Size.xl} radius={Shape.radius.full} />
              </Inline>

              <AppText variant="subheading">Elevation</AppText>
              <Stack space="md">
                <Box background="surface" padding="md" borderRadius="r2" shadow="sm">
                  <AppText variant="caption">shadow sm</AppText>
                </Box>
                <Box background="surface" padding="md" borderRadius="r2" shadow="md">
                  <AppText variant="caption">shadow md</AppText>
                </Box>
                <Box background="surface" padding="md" borderRadius="r2" shadow="lg">
                  <AppText variant="caption">shadow lg</AppText>
                </Box>
              </Stack>

              <AppText variant="subheading">Separator</AppText>
              <Box flexDirection="row" alignItems="stretch" minHeight={Size.lg}>
                <AppText variant="caption">Horizontal</AppText>
                <Separator vertical space={Spacing.xs} />
                <Box flex={1} justifyContent="center">
                  <Separator />
                </Box>
              </Box>
            </PreviewSectionCard>

            {/* Performance Stress Test Section */}
            <AppCard elevation="sm" paddingSize="lg">
              <Stack space="md">
                <AppText variant="heading">Performance Stress Test</AppText>
                <AppText variant="caption" color="secondary">
                  Rendering 100 Box components with prop-drainage enabled.
                </AppText>
                <Separator />

                <Inline flexWrap="wrap" gap={4}>
                  {Array.from({ length: 100 }).map((_, i) => (
                    <Box
                      key={i}
                      width={16}
                      height={16}
                      background={i % 2 === 0 ? 'primary' : 'surfaceSecondary'}
                      borderRadius={i % 5 === 0 ? 'full' : 'sm'}
                      opacity={0.8}
                    />
                  ))}
                </Inline>
              </Stack>
            </AppCard>

            <Box alignItems="center" paddingVertical="xl">
              <AppText variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
                This is your visual truth. If it looks wrong here, it&apos;s wrong everywhere.
              </AppText>
            </Box>
          </Stack>
        </Box>

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
