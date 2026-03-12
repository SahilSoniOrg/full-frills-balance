import { AlertContainer } from '@/src/components/common/AlertContainer';
import { ToastContainer } from '@/src/components/common/Toast';
import { ErrorBoundary } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { UIProvider, useUI } from '@/src/contexts/UIContext';
import { database } from '@/src/data/database/Database';
import { AppLockInterceptor } from '@/src/features/app/components/AppLockInterceptor';
import { useAppBootstrap } from '@/src/features/app/hooks/useAppBootstrap';
import { RestartRequiredScreen } from '@/src/features/dev';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { useTheme } from '@/src/hooks/use-theme';
import { useObservable } from '@/src/hooks/useObservable';
import { analytics, posthogClient } from '@/src/services/analytics-service';
import { insightService } from '@/src/services/insight-service';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import {
  DMSerifDisplay_400Regular,
} from '@expo-google-fonts/dm-serif-display';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
  useFonts,
} from '@expo-google-fonts/instrument-sans';
import {
  Raleway_400Regular,
  Raleway_500Medium,
  Raleway_600SemiBold,
  Raleway_700Bold,
} from '@expo-google-fonts/raleway';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname, useSegments } from 'expo-router';
import { PostHogProvider } from 'posthog-react-native';
import React from 'react';
import 'react-native-reanimated';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeHexColor(color: string) {
  const sanitized = color.trim().replace('#', '');
  if (sanitized.length === 3) {
    return `#${sanitized
      .split('')
      .map((char) => char + char)
      .join('')
      .toUpperCase()}`;
  }
  if (sanitized.length === 6) {
    return `#${sanitized.toUpperCase()}`;
  }
  return '#FFFFFF';
}

function parseHexColor(color: string) {
  const normalized = normalizeHexColor(color).slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function toHexColor({
  r,
  g,
  b,
}: {
  r: number;
  g: number;
  b: number;
}) {
  return `#${[r, g, b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function mixHexColors(base: string, overlay: string, overlayWeight: number) {
  const safeWeight = Math.max(0, Math.min(1, overlayWeight));
  const baseRgb = parseHexColor(base);
  const overlayRgb = parseHexColor(overlay);

  return toHexColor({
    r: baseRgb.r * (1 - safeWeight) + overlayRgb.r * safeWeight,
    g: baseRgb.g * (1 - safeWeight) + overlayRgb.g * safeWeight,
    b: baseRgb.b * (1 - safeWeight) + overlayRgb.b * safeWeight,
  });
}

function withHexAlpha(color: string, alpha: number) {
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const normalized = normalizeHexColor(color).slice(1);
  const alphaHex = clampChannel(255 * safeAlpha).toString(16).padStart(2, '0').toUpperCase();
  return `#${alphaHex}${normalized}`;
}

function buildWidgetThemeSnapshot(
  themeId: string,
  themeMode: 'light' | 'dark',
  theme: {
    primary: string;
    primaryLight: string;
    income: string;
    expense: string;
    transfer: string;
    surface: string;
    text: string;
    textSecondary: string;
    pure: string;
  }
) {
  const backgroundStartColor = normalizeHexColor(theme.surface);
  const backgroundEndColor = themeMode === 'dark'
    ? mixHexColors(theme.surface, theme.primary, 0.22)
    : mixHexColors(theme.surface, theme.primaryLight, 0.16);

  return {
    themeId,
    themeMode,
    backgroundStartColor,
    backgroundEndColor,
    titleColor: normalizeHexColor(theme.primary),
    primaryTextColor: normalizeHexColor(theme.text),
    secondaryTextColor: normalizeHexColor(theme.textSecondary),
    actionIconColor: normalizeHexColor(theme.primary),
    incomeAccentColor: mixHexColors(theme.income, theme.pure, themeMode === 'dark' ? 0.28 : 0.82),
    expenseAccentColor: mixHexColors(theme.expense, theme.pure, themeMode === 'dark' ? 0.28 : 0.82),
    transferAccentColor: mixHexColors(theme.transfer, theme.pure, themeMode === 'dark' ? 0.24 : 0.84),
  };
}

function PostHogScreenTracker() {
  const pathname = usePathname();
  const segments = useSegments();

  React.useEffect(() => {
    if (pathname) {
      // Screen name can be the pathname or a more descriptive string from segments
      const screenName = segments.join('/') || 'index';
      analytics.screen(screenName, {
        pathname,
      });
    }
  }, [pathname, segments]);

  return null;
}

function WidgetDataSync() {
  const { themeId } = useUI();
  const { theme, themeMode } = useTheme();
  const { data: safeToSpendData } = useObservable(
    () => insightService.observeSafeToSpend(),
    [],
    null
  );

  React.useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const expoWidgetsModule = require('@/modules/expo-widgets').default as {
      syncWidgetData: (snapshot: {
        safeToSpend?: {
          amount: number;
          currencyCode: string;
          formattedAmount: string;
          title: string;
          subtitle: string;
          updatedAt: number;
        };
        theme: {
          themeId: string;
          themeMode: 'light' | 'dark';
          backgroundStartColor: string;
          backgroundEndColor: string;
          titleColor: string;
          primaryTextColor: string;
          secondaryTextColor: string;
          actionIconColor: string;
          incomeAccentColor: string;
          expenseAccentColor: string;
          transferAccentColor: string;
        };
      }) => Promise<void>;
    };

    const isShortfall = (safeToSpendData?.shortfall ?? 0) > 0;
    const displayAmount = isShortfall
      ? (safeToSpendData?.shortfall ?? 0)
      : (safeToSpendData?.safeToSpend ?? 0);

    void expoWidgetsModule.syncWidgetData({
      safeToSpend: safeToSpendData
        ? {
            amount: displayAmount,
            currencyCode: safeToSpendData.currencyCode,
            formattedAmount: CurrencyFormatter.format(displayAmount, safeToSpendData.currencyCode, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }),
            title: isShortfall
              ? AppConfig.strings.dashboard.shortfall
              : AppConfig.strings.dashboard.safeToSpendTitle,
            subtitle: isShortfall
              ? AppConfig.strings.dashboard.neededForObligations
              : AppConfig.strings.dashboard.afterObligations,
            updatedAt: Date.now(),
          }
        : undefined,
      theme: buildWidgetThemeSnapshot(themeId, themeMode, theme),
    }).catch(() => undefined);
  }, [
    theme.expense,
    theme.income,
    theme.primary,
    theme.primaryLight,
    theme.pure,
    theme.surface,
    theme.text,
    theme.textSecondary,
    theme.transfer,
    themeId,
    themeMode,
    safeToSpendData?.currencyCode,
    safeToSpendData?.safeToSpend,
    safeToSpendData?.shortfall,
  ]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    'DMSerifDisplay-Regular': DMSerifDisplay_400Regular,
    'InstrumentSans-Regular': InstrumentSans_400Regular,
    'InstrumentSans-Medium': InstrumentSans_500Medium,
    'InstrumentSans-SemiBold': InstrumentSans_600SemiBold,
    'InstrumentSans-Bold': InstrumentSans_700Bold,
    'Raleway-Regular': Raleway_400Regular,
    'Raleway-Medium': Raleway_500Medium,
    'Raleway-SemiBold': Raleway_600SemiBold,
    'Raleway-Bold': Raleway_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <DatabaseProvider database={database}>
          <UIProvider>
            <PostHogProvider
              client={posthogClient ?? undefined}
              debug={__DEV__}
            >
              <PostHogScreenTracker />
              {Platform.OS !== 'web' ? <WidgetDataSync /> : null}
              <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                <AppLockInterceptor>
                  <AppContent />
                </AppLockInterceptor>
                <AlertContainer />
                <ToastContainer />
              </ThemeProvider>
            </PostHogProvider>
          </UIProvider>
        </DatabaseProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { isRestartRequired } = useUI();

  useAppBootstrap();

  if (isRestartRequired) {
    return <RestartRequiredScreen />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="journal-entry" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="account-creation" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="_design-preview" options={{ headerShown: false }} />
      <Stack.Screen name="account-details" options={{ headerShown: false }} />
      <Stack.Screen name="transaction-details" options={{ headerShown: false }} />
      <Stack.Screen name="account-reorder" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="manage-hierarchy" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="import-selection" options={{ headerShown: false }} />
      <Stack.Screen name="audit-log" options={{ headerShown: false }} />
      <Stack.Screen name="appearance-settings" options={{ headerShown: false, presentation: 'modal' }} />
    </Stack>
  );
}
