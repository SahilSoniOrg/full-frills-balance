import { FontIds } from '@/src/constants/design-tokens';
import { useUI } from '@/src/contexts/UIContext';
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
const FONT_MAP: Record<string, Record<string, any>> = {
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

const DEFAULT_FONT_PREWARM_PROMISE = Font.loadAsync(FONT_MAP[FontIds.DEEP_SPACE]).catch(() => {});

/**
 * useFonts - Dynamically loads fonts based on the selected theme.
 */
export function useFonts() {
  const { fontId, dispatchBootEvent } = useUI();
  const loadedFontSetsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let isActive = true;

    async function loadFontSet() {
      if (loadedFontSetsRef.current.has(fontId)) {
        if (isActive) dispatchBootEvent('FONTS_LOADED');
        return;
      }

      const fontsToLoad = FONT_MAP[fontId];
      if (!fontsToLoad) {
        if (isActive) dispatchBootEvent('FONTS_LOADED');
        return;
      }

      try {
        if (fontId === FontIds.DEEP_SPACE) {
          await DEFAULT_FONT_PREWARM_PROMISE;
        } else {
          await Font.loadAsync(fontsToLoad);
        }

        if (isActive) {
          loadedFontSetsRef.current.add(fontId);
          dispatchBootEvent('FONTS_LOADED');
        }
      } catch {
        if (isActive) dispatchBootEvent('FONTS_LOADED');
      }
    }

    loadFontSet();

    return () => {
      isActive = false;
    };
  }, [fontId, dispatchBootEvent]);
}
