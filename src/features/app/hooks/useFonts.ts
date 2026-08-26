import { FontIds } from '@/src/constants/design-tokens';
import { useAppReady } from '@/src/contexts/app-shell/AppReadyProvider';
import { useThemePrefs } from '@/src/hooks/useThemePrefs';
import { logger } from '@/src/utils/logger';
import { CrimsonText_400Regular } from '@expo-google-fonts/crimson-text/400Regular';
import { CrimsonText_700Bold } from '@expo-google-fonts/crimson-text/700Bold';
import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display/400Regular';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans/400Regular';
import { InstrumentSans_500Medium } from '@expo-google-fonts/instrument-sans/500Medium';
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { InstrumentSans_700Bold } from '@expo-google-fonts/instrument-sans/700Bold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Raleway_400Regular } from '@expo-google-fonts/raleway/400Regular';
import { Raleway_500Medium } from '@expo-google-fonts/raleway/500Medium';
import { Raleway_600SemiBold } from '@expo-google-fonts/raleway/600SemiBold';
import { Raleway_700Bold } from '@expo-google-fonts/raleway/700Bold';
import * as Font from 'expo-font';
import { useEffect, useRef } from 'react';

// Define the fonts needed for each ID
type FontMap = Parameters<typeof Font.loadAsync>[0];

const FONT_MAP: Record<string, FontMap> = {
  [FontIds.DEEP_SPACE]: {
    'DMSerifDisplay-Regular': DMSerifDisplay_400Regular,
    'InstrumentSans-Regular': InstrumentSans_400Regular,
    'InstrumentSans-Medium': InstrumentSans_500Medium,
    'InstrumentSans-SemiBold': InstrumentSans_600SemiBold,
    'InstrumentSans-Bold': InstrumentSans_700Bold,
  },
  [FontIds.IVY]: {
    'Raleway-Regular': Raleway_400Regular,
    'Raleway-Medium': Raleway_500Medium,
    'Raleway-SemiBold': Raleway_600SemiBold,
    'Raleway-Bold': Raleway_700Bold,
  },
  [FontIds.EDITORIAL]: {
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
    'CrimsonText-Regular': CrimsonText_400Regular,
    'CrimsonText-Bold': CrimsonText_700Bold,
  },
};

/**
 * useFonts - Dynamically loads fonts based on the selected theme.
 */
export function useFonts() {
  const { fontId } = useThemePrefs();
  const { setFontsReady } = useAppReady();
  const loadedFontSetsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let isActive = true;

    async function loadFontSet() {
      const start = performance.now();
      logger.info(`[Fonts] Starting load for: ${fontId}`);

      // Custom fonts are a visual enhancement, not a reason to block the
      // first interactive frame. React Native can render with its fallback
      // font while the selected family is loaded in the background.
      if (isActive) setFontsReady(true, fontId);

      if (loadedFontSetsRef.current.has(fontId)) {
        logger.debug(`[Fonts] Font already loaded: ${fontId}`);
        return;
      }

      const fontsToLoad = FONT_MAP[fontId];
      if (!fontsToLoad) {
        logger.warn(`[Fonts] No configuration found for: ${fontId}`);
        return;
      }

      try {
        await Font.loadAsync(fontsToLoad);

        const duration = Math.round(performance.now() - start);
        logger.info(`[Fonts] Successfully loaded: ${fontId} in ${duration}ms`);

        if (isActive) {
          loadedFontSetsRef.current.add(fontId);
          setFontsReady(true, fontId);
        }
      } catch (err) {
        logger.error(`[Fonts] Failed to load: ${fontId}`, err);
      }
    }

    loadFontSet();

    return () => {
      isActive = false;
    };
  }, [fontId, setFontsReady]);
}
