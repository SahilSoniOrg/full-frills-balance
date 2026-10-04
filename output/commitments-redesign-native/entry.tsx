import { useEffect, useState } from 'react';
import { registerRootComponent } from 'expo';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ThemeOverride } from '@/src/contexts/UIContext';
import { WorkplaceContext } from '@/src/contexts/WorkplaceContext';
import { AppReadyContext } from '@/src/contexts/app-shell/appReady';
import { PrivacyScopeProvider, usePrivacyScope } from '@/src/contexts/PrivacyScope';
import { FontIds, Size, Spacing, ThemeIds, getThemeColors } from '@/src/constants/design-tokens';
import { ensureFontSetLoaded } from '@/src/utils/loadFontSet';
import { LaunchArguments } from 'react-native-launch-arguments';
import { BudgetListView } from '@/src/features/budget/components/BudgetListView';
import { PlannedPaymentListView } from '@/src/features/planned-payments/components/PlannedPaymentListView';
import { BudgetDetailView } from '@/src/features/budget/components/BudgetDetailView';
import { PlannedPaymentDetailsView } from '@/src/features/planned-payments/components/PlannedPaymentDetailsView';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome, TabScreenChrome } from '@/src/components/layout/screenChrome';
import { AppSegmentedControl } from '@/src/components/core';
import { CommitmentDetailHeaderActions } from '@/src/components/shared/CommitmentDetailHeaderActions';
import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { AppConfig } from '@/src/constants';
import { Icon } from '@/src/types/domainIcons';
import {
  BudgetFixtures,
  budgetDetailFixture,
  budgetDetailMissingFxFixture,
  budgetDetailNothingSpentFixture,
  budgetDetailOverLimitFixture,
  harnessWorkplace,
  plannedDetailEndedFixture,
  plannedDetailFixture,
  plannedDetailPausedFixture,
  plannedDetailSavedOccurrenceFixture,
  plannedFixtureCount,
} from './fixtures';

type Screen = 'budgets' | 'planned' | 'budget-detail' | 'planned-detail';
type Appearance = 'light' | 'dark';
type FixtureState =
  | 'default'
  | 'nothing-over'
  | 'nothing-spent'
  | 'missing-fx'
  | 'over-limit'
  | 'paused'
  | 'ended'
  | 'long-content';
type LaunchConfig = {
  screen?: Screen;
  appearance?: Appearance;
  width?: number;
  privacy?: boolean;
  capture?: boolean;
  fixture?: FixtureState;
};

function getLaunchConfig(): LaunchConfig {
  const args = LaunchArguments.value<{
    screen?: string;
    appearance?: string;
    width?: string;
    privacy?: string | boolean;
    capture?: string | boolean;
    fixture?: string;
  }>();
  const { screen, appearance } = args;
  const width = Number(args.width);
  return {
    ...(screen === 'budgets' ||
    screen === 'planned' ||
    screen === 'budget-detail' ||
    screen === 'planned-detail'
      ? { screen }
      : {}),
    ...(appearance === 'light' || appearance === 'dark' ? { appearance } : {}),
    ...(width === 320 || width === 390 ? { width } : {}),
    ...(args.privacy !== undefined
      ? { privacy: args.privacy === true || args.privacy === 'true' || args.privacy === '1' }
      : {}),
    ...(args.capture !== undefined
      ? { capture: args.capture === true || args.capture === 'true' || args.capture === '1' }
      : {}),
    ...(args.fixture === 'nothing-over' ||
    args.fixture === 'nothing-spent' ||
    args.fixture === 'missing-fx' ||
    args.fixture === 'over-limit' ||
    args.fixture === 'paused' ||
    args.fixture === 'ended' ||
    args.fixture === 'long-content'
      ? { fixture: args.fixture }
      : {}),
  };
}

function LaunchPrivacySync({ privacy }: { privacy?: boolean }) {
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyScope();
  useEffect(() => {
    if (privacy !== undefined && isPrivacyMode !== privacy) togglePrivacyMode();
  }, [isPrivacyMode, privacy, togglePrivacyMode]);
  return null;
}

function HarnessControls({
  screen,
  setScreen,
  appearance,
  setAppearance,
  width,
  setWidth,
}: {
  screen: Screen;
  setScreen: (screen: Screen) => void;
  appearance: Appearance;
  setAppearance: (value: Appearance) => void;
  width: number | null;
  setWidth: (value: number | null) => void;
}) {
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyScope();
  const { width: windowWidth } = useWindowDimensions();
  const theme = getThemeColors(ThemeIds.DEEP_SPACE, appearance);
  const options: [Screen, string][] = [
    ['budgets', 'Budgets'],
    ['planned', 'Planned'],
    ['budget-detail', 'Budget detail'],
    ['planned-detail', 'Payment detail'],
  ];
  return (
    <View
      style={[
        styles.controlPanel,
        { backgroundColor: theme.surface, borderColor: theme.surfaceSecondary },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.optionRow}
      >
        {options.map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setScreen(value)}
            accessibilityRole="button"
            accessibilityLabel={`Show ${label}`}
            style={[
              styles.control,
              { backgroundColor: screen === value ? theme.primary : theme.surfaceSecondary },
            ]}
          >
            <Text style={{ color: screen === value ? theme.onHighContrastSurface : theme.text }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.optionRow}>
        {(['light', 'dark'] as const).map(value => (
          <Pressable
            key={value}
            onPress={() => setAppearance(value)}
            accessibilityRole="button"
            accessibilityLabel={`${value} appearance`}
            style={[
              styles.control,
              { backgroundColor: appearance === value ? theme.primary : theme.surfaceSecondary },
            ]}
          >
            <Text
              style={{ color: appearance === value ? theme.onHighContrastSurface : theme.text }}
            >
              {value}
            </Text>
          </Pressable>
        ))}
        {[390, 320].map(value => (
          <Pressable
            key={value}
            onPress={() => setWidth(width === value ? null : value)}
            accessibilityRole="button"
            accessibilityLabel={`${value} point content width`}
            style={[
              styles.control,
              { backgroundColor: width === value ? theme.primary : theme.surfaceSecondary },
            ]}
          >
            <Text style={{ color: width === value ? theme.onHighContrastSurface : theme.text }}>
              {value}pt
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={togglePrivacyMode}
          accessibilityRole="button"
          accessibilityLabel={`Privacy mode ${isPrivacyMode ? 'on' : 'off'}`}
          style={[
            styles.control,
            { backgroundColor: isPrivacyMode ? theme.warning : theme.surfaceSecondary },
          ]}
        >
          <Text style={{ color: isPrivacyMode ? theme.onHighContrastSurface : theme.text }}>
            Privacy {isPrivacyMode ? 'on' : 'off'}
          </Text>
        </Pressable>
      </View>
      <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
        Native component harness · content width {width ?? Math.round(windowWidth)}pt
      </Text>
    </View>
  );
}

function Harness() {
  const [launchConfig] = useState<LaunchConfig>(getLaunchConfig);
  const [screen, setScreen] = useState<Screen>(launchConfig.screen ?? 'budgets');
  const [appearance, setAppearance] = useState<Appearance>(launchConfig.appearance ?? 'dark');
  const [width, setWidth] = useState<number | null>(launchConfig.width ?? null);
  const [fontsReady, setFontsReady] = useState(false);
  const [fontError, setFontError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void ensureFontSetLoaded(FontIds.DEEP_SPACE)
      .then(() => {
        if (active) setFontsReady(true);
      })
      .catch(error => {
        if (active) setFontError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, []);
  const theme = getThemeColors(ThemeIds.DEEP_SPACE, appearance);
  const appReadyValue = {
    isLoading: false,
    isInitialized: true,
    fontsReady,
    loadedFontId: FontIds.DEEP_SPACE,
    isDataHydrated: true,
    isAppReady: true,
    setFontsReady: () => {},
    setDataHydrated: () => {},
  };
  const copy = AppConfig.strings.commitmentsRedesign;
  const budgetListFixture =
    launchConfig.fixture === 'nothing-over'
      ? BudgetFixtures.budgetListNoOver
      : launchConfig.fixture === 'long-content'
        ? BudgetFixtures.budgetListLongNames
        : BudgetFixtures.budgetList;
  const plannedListFixture =
    launchConfig.fixture === 'long-content'
      ? BudgetFixtures.plannedListLongNames
      : BudgetFixtures.plannedList;
  const selectedBudgetDetail =
    launchConfig.fixture === 'nothing-spent'
      ? budgetDetailNothingSpentFixture
      : launchConfig.fixture === 'missing-fx'
        ? budgetDetailMissingFxFixture
        : launchConfig.fixture === 'over-limit'
          ? budgetDetailOverLimitFixture
          : budgetDetailFixture;
  const selectedPlannedDetail =
    launchConfig.fixture === 'paused'
      ? plannedDetailPausedFixture
      : launchConfig.fixture === 'ended'
        ? plannedDetailEndedFixture
        : launchConfig.fixture === 'long-content'
          ? plannedDetailSavedOccurrenceFixture
          : plannedDetailFixture;
  const listChrome: TabScreenChrome = {
    screenTitle: copy.title,
    headerActions: <PrivacyToggleButton />,
    fab: {
      onPress: () => {},
      label: screen === 'planned' ? copy.plannedAction : copy.budgetAction,
      accessibilityLabel: screen === 'planned' ? copy.createPlanned : copy.createBudget,
    },
  };
  const budgetDetailChrome: ScreenNavChrome = {
    screenTitle: 'Groceries',
    showBack: true,
    backIcon: Icon.Back,
    onBack: () => setScreen('budgets'),
    headerActions: (
      <CommitmentDetailHeaderActions
        actions={[
          { label: copy.edit, onPress: budgetDetailFixture.handleEdit },
          { label: copy.delete, onPress: budgetDetailFixture.handleDelete, destructive: true },
        ]}
      />
    ),
    fab: {
      onPress: budgetDetailFixture.onAddExpense,
      label: copy.expenseAction,
      accessibilityLabel: copy.addExpense,
    },
  };
  const paymentDetailChrome: ScreenNavChrome = {
    ...budgetDetailChrome,
    screenTitle: 'Streamline Pro',
    headerActions: (
      <CommitmentDetailHeaderActions
        actions={[
          { label: copy.edit, onPress: () => {}, testID: 'edit-button' },
          ...(selectedPlannedDetail.onToggleStatus
            ? [
                {
                  label: selectedPlannedDetail.status === 'PAUSED' ? copy.resume : copy.pause,
                  onPress: selectedPlannedDetail.onToggleStatus,
                },
              ]
            : []),
          ...(selectedPlannedDetail.outstandingJournalId
            ? [{ label: copy.openPending, onPress: () => {}, testID: 'open-pending-entry' }]
            : []),
          { label: copy.delete, onPress: () => {}, destructive: true, testID: 'delete-button' },
        ]}
      />
    ),
    fab: undefined,
  };
  const isList = screen === 'budgets' || screen === 'planned';
  const activeTab = screen === 'planned' ? 'planned' : 'budgets';
  const tabOptions = [
    { id: 'budgets' as const, label: `${copy.budgets} ${budgetListFixture.items.length}` },
    { id: 'planned' as const, label: `${copy.planned} ${plannedFixtureCount}` },
  ];
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppReadyContext.Provider value={appReadyValue}>
        <ThemeOverride mode={appearance} themeId={ThemeIds.DEEP_SPACE} fontId={FontIds.DEEP_SPACE}>
          <PrivacyScopeProvider>
            <WorkplaceContext.Provider value={harnessWorkplace}>
              <View style={[styles.root, { backgroundColor: theme.background }]}>
                <LaunchPrivacySync privacy={launchConfig.privacy} />
                {!launchConfig.capture && (
                  <HarnessControls
                    screen={screen}
                    setScreen={setScreen}
                    appearance={appearance}
                    setAppearance={setAppearance}
                    width={width}
                    setWidth={setWidth}
                  />
                )}
                {fontError ? (
                  <Text accessibilityRole="alert" style={styles.fontError}>
                    Font loading failed: {fontError}
                  </Text>
                ) : null}
                {!fontsReady && !fontError ? (
                  <Text style={{ color: theme.text }}>Loading Deep Space fonts…</Text>
                ) : null}
                {fontsReady && (
                  <View style={[styles.viewport, { width: width ?? '100%' }]}>
                    {isList ? (
                      <ScreenWithChrome chrome={listChrome} scrollable={false}>
                        <View style={styles.segmentedWrap}>
                          <AppSegmentedControl
                            testID="commitments-tabs"
                            options={tabOptions}
                            value={activeTab}
                            onChange={next => setScreen(next)}
                            flex
                            itemHeight={Size.buttonMd}
                            trackColor="surface"
                            pillColor="surfaceSecondary"
                            activeTextColor="text"
                            inactiveTextColor="textSecondary"
                          />
                        </View>
                        <View style={styles.listContent}>
                          {screen === 'budgets' ? (
                            <BudgetListView {...budgetListFixture} />
                          ) : (
                            <PlannedPaymentListView {...plannedListFixture} />
                          )}
                        </View>
                      </ScreenWithChrome>
                    ) : screen === 'budget-detail' ? (
                      <BudgetDetailView {...selectedBudgetDetail} chrome={budgetDetailChrome} />
                    ) : (
                      <PlannedPaymentDetailsView
                        {...selectedPlannedDetail}
                        theme={getThemeColors(ThemeIds.DEEP_SPACE, appearance)}
                        chrome={paymentDetailChrome}
                      />
                    )}
                  </View>
                )}
              </View>
            </WorkplaceContext.Provider>
          </PrivacyScopeProvider>
        </ThemeOverride>
      </AppReadyContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  viewport: { flex: 1, maxWidth: '100%' },
  segmentedWrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  listContent: { flex: 1 },
  controlPanel: {
    width: '100%',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  fontError: { color: '#FF6464', padding: 16, fontSize: 14 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  control: {
    paddingHorizontal: 10,
    minHeight: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

registerRootComponent(Harness);
