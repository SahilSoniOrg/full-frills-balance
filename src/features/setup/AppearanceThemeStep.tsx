import { Icon, AppButton, AppCard, AppIcon, AppText } from '@/src/components/core';
import {
  AppConfig,
  FontId,
  FontIds,
  FontSchemes,
  Spacing,
  ThemeId,
  ThemeIds,
} from '@/src/constants';
import { useThemePrefs } from '@/src/hooks/useThemePrefs';
import { Box, Stack } from '@/src/design-system';
import { SetupStsPreview } from './SetupStsPreview';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { triggerHaptic } from '@/src/utils/haptics';
import { logger } from '@/src/utils/logger';
import { MotiView } from 'moti';
import { useState, useEffect, type ReactNode } from 'react';
import { commitFontIdAfterLoad, ensureAllFontSetsLoaded } from '@/src/utils/loadFontSet';
import {
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

type AppearanceThemeStepProps = {
  currencyCode: string;
  onContinue: () => void;
  onBack: () => void;
  isCompleting: boolean;
  backLabel?: string;
  themeId?: ThemeId;
  fontId?: FontId;
  onThemeChange?: (themeId: ThemeId) => void;
  onFontChange?: (fontId: FontId) => void;
};

let globalThemeId: ThemeId | null = null;

function ThemeLabelMotion({
  motionKey,
  fromX,
  reduceMotion,
  children,
}: {
  motionKey: string;
  fromX: number;
  reduceMotion: boolean;
  children: ReactNode;
}) {
  if (reduceMotion) return children;
  return (
    <MotiView
      key={motionKey}
      from={{ opacity: 0, translateX: fromX }}
      animate={{ opacity: 1, translateX: 0 }}
      transition={{ type: 'timing', duration: 250 }}
    >
      {children}
    </MotiView>
  );
}

export function AppearanceThemeStep(props: AppearanceThemeStepProps) {
  return <AppearanceThemeStepContent {...props} />;
}

function AppearanceThemeStepContent(props: AppearanceThemeStepProps) {
  const { currencyCode } = props;
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const {
    themeId: persistedThemeId,
    fontId: persistedFontId,
    setThemeId: persistThemeId,
    setFontId: persistFontId,
  } = useThemePrefs();
  const themeId = props.themeId ?? persistedThemeId;
  const fontId = props.fontId ?? persistedFontId;

  useEffect(() => {
    void ensureAllFontSetsLoaded().catch(error => {
      logger.error('[Fonts] Failed to preload appearance font schemes', error);
    });
  }, []);

  const handleSelectTheme = (nextThemeId: ThemeId) => {
    void triggerHaptic('light');
    if (props.onThemeChange) {
      props.onThemeChange(nextThemeId);
    } else {
      persistThemeId(nextThemeId);
    }
  };

  const handleSelectFont = (nextFontId: FontId) => {
    void triggerHaptic('light');
    if (props.onFontChange) {
      void commitFontIdAfterLoad(nextFontId, id => {
        props.onFontChange?.(id as FontId);
      }).catch(error => {
        logger.error(`[Fonts] Setup preview failed to load: ${nextFontId}`, error);
      });
      return;
    }
    persistFontId(nextFontId);
  };

  const strings = AppConfig.strings.onboarding.appearance;
  const settingsStrings = AppConfig.strings.settings.appearance;

  const THEME_ORDER = [
    ThemeIds.DEEP_SPACE,
    ThemeIds.GOLD_OBSIDIAN,
    ThemeIds.IVY,
    ThemeIds.EDITORIAL,
  ];

  useEffect(() => {
    globalThemeId = themeId;
  }, [themeId]);
  const [slideDirection, setSlideDirection] = useState<number>(1);

  const cycleTheme = (direction: number) => {
    const currentIndex = globalThemeId ? THEME_ORDER.indexOf(globalThemeId) : -1;
    if (currentIndex === -1) return;

    let nextIndex = currentIndex + direction;
    if (nextIndex >= THEME_ORDER.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = THEME_ORDER.length - 1;

    triggerHaptic('light');
    setSlideDirection(direction);
    handleSelectTheme(THEME_ORDER[nextIndex]);
  };

  const [panResponder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        // Only capture horizontal swipes
        return (
          Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
        );
      },
      onPanResponderRelease: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        if (gestureState.dx > 50) {
          // Swipe right -> previous theme
          cycleTheme(-1);
        } else if (gestureState.dx < -50) {
          // Swipe left -> next theme
          cycleTheme(1);
        }
      },
    }),
  );

  const THEME_LABELS: Record<ThemeId, string> = {
    [ThemeIds.DEEP_SPACE]: settingsStrings.deepSpace.label,
    [ThemeIds.GOLD_OBSIDIAN]: settingsStrings.goldObsidian.label,
    [ThemeIds.IVY]: settingsStrings.ivy.label,
    [ThemeIds.EDITORIAL]: settingsStrings.editorial.label,
  };

  const getThemeLabel = (offset: number) => {
    const currentIndex = THEME_ORDER.indexOf(themeId);
    if (currentIndex === -1) return '';
    let targetIndex = currentIndex + offset;
    if (targetIndex >= THEME_ORDER.length) targetIndex = 0;
    if (targetIndex < 0) targetIndex = THEME_ORDER.length - 1;
    return THEME_LABELS[THEME_ORDER[targetIndex] as ThemeId];
  };

  const renderFontOption = (id: FontId, label: string) => {
    const isSelected = fontId === id;
    return (
      <Pressable
        style={{ flex: 1 }}
        onPress={() => handleSelectFont(id)}
        testID={`onboarding-font-${id}-option`}
      >
        <AppCard
          elevation={isSelected ? 'sm' : 'none'}
          style={[
            { padding: Spacing.md, borderRadius: 16, alignItems: 'center', gap: Spacing.sm },
            { borderWidth: isSelected ? 2 : 1 },
            { borderColor: isSelected ? theme.primary : theme.border },
          ]}
        >
          <AppText
            variant="heading"
            style={{ fontFamily: FontSchemes[id].heading, fontSize: 24, lineHeight: 28 }}
          >
            Aa
          </AppText>
          <AppText
            variant="caption"
            weight={isSelected ? 'bold' : 'regular'}
            style={{ textAlign: 'center' }}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {label}
          </AppText>
        </AppCard>
      </Pressable>
    );
  };

  return (
    <Box flex={1}>
      <Stack align="center" paddingTop="xl" paddingBottom="xxl" space="xs">
        <AppText variant="title" style={styles.headerTitle}>
          {strings.title}
        </AppText>
        <AppText variant="body" color="secondary" style={styles.headerSubtitle}>
          {strings.subtitle}
        </AppText>
      </Stack>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* PREVIEW */}
        <AppText variant="subheading" weight="semibold" style={styles.sectionTitle}>
          {strings.previewLabel}
        </AppText>
        <View {...panResponder.panHandlers}>
          <View pointerEvents="none">
            <SetupStsPreview currencyCode={currencyCode} />
          </View>
        </View>

        {/* Theme Selector Ribbon */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: Spacing.md,
            marginBottom: Spacing.xxl,
          }}
        >
          <Pressable
            onPress={() => cycleTheme(-1)}
            hitSlop={20}
            accessibilityRole="button"
            accessibilityLabel={`Previous theme, ${getThemeLabel(-1)}`}
            testID="onboarding-theme-previous-button"
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 4 }}
          >
            <AppIcon name={Icon.ChevronLeft} size={20} color={theme.textSecondary} />
            <ThemeLabelMotion
              motionKey={`prev-${themeId}`}
              fromX={slideDirection * 10}
              reduceMotion={reduceMotion}
            >
              <AppText
                variant="caption"
                color="secondary"
                numberOfLines={2}
                ellipsizeMode="tail"
                style={styles.themeNeighborLabel}
              >
                {getThemeLabel(-1)}
              </AppText>
            </ThemeLabelMotion>
          </Pressable>

          <View style={{ flex: 1, alignItems: 'center', overflow: 'hidden' }}>
            <ThemeLabelMotion
              motionKey={`curr-${themeId}`}
              fromX={slideDirection * 20}
              reduceMotion={reduceMotion}
            >
              <AppText weight="bold" numberOfLines={1}>
                {getThemeLabel(0)}
              </AppText>
            </ThemeLabelMotion>
          </View>

          <Pressable
            onPress={() => cycleTheme(1)}
            hitSlop={20}
            accessibilityRole="button"
            accessibilityLabel={`Next theme, ${getThemeLabel(1)}`}
            testID="onboarding-theme-next-button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              flex: 1,
              gap: 4,
            }}
          >
            <ThemeLabelMotion
              motionKey={`next-${themeId}`}
              fromX={slideDirection * 10}
              reduceMotion={reduceMotion}
            >
              <AppText
                variant="caption"
                color="secondary"
                numberOfLines={2}
                ellipsizeMode="tail"
                style={styles.themeNeighborLabel}
              >
                {getThemeLabel(1)}
              </AppText>
            </ThemeLabelMotion>
            <AppIcon name={Icon.ChevronRight} size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <AppText variant="subheading" weight="semibold" style={styles.sectionTitle}>
          {strings.fontTitle}
        </AppText>
        <View style={styles.optionsContainer}>
          {renderFontOption(FontIds.DEEP_SPACE, settingsStrings.serifSans.label)}
          {renderFontOption(FontIds.IVY, settingsStrings.modernGeometric.label)}
          {renderFontOption(FontIds.EDITORIAL, settingsStrings.classicSerif.label)}
        </View>
      </ScrollView>

      <Box background="background" borderTopWidth={1} borderColor="border" paddingTop="md">
        <Stack space="xs">
          <AppButton
            variant="primary"
            size="lg"
            onPress={props.onContinue}
            disabled={props.isCompleting}
            style={{ width: '100%' }}
            testID="onboarding-theme-continue-button"
          >
            Review setup
          </AppButton>
          <AppButton variant="ghost" size="md" onPress={props.onBack} disabled={props.isCompleting}>
            {props.backLabel ?? 'Back'}
          </AppButton>
        </Stack>
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    textAlign: 'center',
  },
  headerSubtitle: {
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xs,
    paddingBottom: Spacing.xxl,
  },
  sectionTitle: {
    marginBottom: Spacing.lg,
  },
  themeNeighborLabel: {
    flexShrink: 1,
    textAlign: 'center',
  },
  optionsContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
});
