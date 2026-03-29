import { FontIds } from '@/src/constants/design-tokens';
import { useUI } from '@/src/contexts/UIContext';
import { CrimsonText_400Regular, CrimsonText_700Bold } from '@expo-google-fonts/crimson-text';
import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  Raleway_400Regular,
  Raleway_500Medium,
  Raleway_600SemiBold,
  Raleway_700Bold,
} from '@expo-google-fonts/raleway';
import * as Font from 'expo-font';
import React, { useEffect, useState } from 'react';

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

interface FontManagerProps {
  children: React.ReactNode;
}

/**
 * FontManager - Dynamically loads fonts based on the selected theme.
 * This prevents loading all fonts at startup, saving memory and improving boot time.
 */
export function FontManager({ children }: FontManagerProps) {
  const { fontId } = useUI();
  const [loadedFontSets, setLoadedFontSets] = useState<Set<string>>(new Set());
  const [currentFontReady, setCurrentFontReady] = useState(false);

  useEffect(() => {
    async function loadFontSet() {
      // If fonts for this theme are already loaded, we're ready
      if (loadedFontSets.has(fontId)) {
        setCurrentFontReady(true);
        return;
      }

      const fontsToLoad = FONT_MAP[fontId];
      if (!fontsToLoad) {
        // Fallback for missing/invalid fontId
        setCurrentFontReady(true);
        return;
      }

      try {
        // We only show a loading state if the CURRENT theme's fonts aren't ready
        setCurrentFontReady(false);

        await Font.loadAsync(fontsToLoad);

        setLoadedFontSets(prev => {
          const next = new Set(prev);
          next.add(fontId);
          return next;
        });
        setCurrentFontReady(true);
      } catch (error) {
        console.error(`Failed to load fonts for ${fontId}`, error);
        // Still allow the app to show (with system fonts) if loading fails
        setCurrentFontReady(true);
      }
    }

    loadFontSet();
  }, [fontId, loadedFontSets]);

  // Block the app ONLY during the initial font load of the current theme
  if (!currentFontReady && loadedFontSets.size === 0) {
    return null; // Or a splash screen component
  }

  return <>{children}</>;
}
