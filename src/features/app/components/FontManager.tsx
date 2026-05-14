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
import React, { useEffect, useRef, useState } from 'react';

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

// Pre-warm the default font set at module evaluation time so it loads in parallel
// with JS bundle parsing and provider tree construction. By the time FontManager
// mounts and checks, the font is often already registered — eliminating the visual
// blocking window on the common-case (default theme) boot path.
const DEFAULT_FONT_PREWARM_PROMISE = Font.loadAsync(FONT_MAP[FontIds.DEEP_SPACE]).catch(() => {
  /* ignore pre-warm failures — FontManager handles fallback */
});

interface FontManagerProps {
  children: React.ReactNode;
}

/**
 * FontManager - Dynamically loads fonts based on the selected theme.
 * This prevents loading all fonts at startup, saving memory and improving boot time.
 */
export function FontManager({ children }: FontManagerProps) {
  const { fontId, dispatchBootEvent } = useUI();
  // Use a ref to track loaded font sets — avoids re-triggering the load effect
  // every time the set is updated (the previous useState approach caused an
  // unnecessary reload loop when loadedFontSets was in the dep array).
  const loadedFontSetsRef = useRef<Set<string>>(new Set());
  const [currentFontReady, setCurrentFontReady] = useState(false);

  useEffect(() => {
    // Local RESET for UI blocking during theme switch
    setCurrentFontReady(false);

    let isActive = true;

    async function loadFontSet() {
      // If fonts for this theme are already loaded (or pre-warmed), we're ready
      if (loadedFontSetsRef.current.has(fontId)) {
        if (isActive) {
          setCurrentFontReady(true);
          dispatchBootEvent('FONTS_LOADED');
        }
        return;
      }

      const fontsToLoad = FONT_MAP[fontId];
      if (!fontsToLoad) {
        // Fallback for missing/invalid fontId
        if (isActive) {
          setCurrentFontReady(true);
          dispatchBootEvent('FONTS_LOADED');
        }
        return;
      }

      try {
        // If this is the default font, await the module-level pre-warm promise
        // (which may already be resolved) rather than starting a new load.
        if (fontId === FontIds.DEEP_SPACE) {
          await DEFAULT_FONT_PREWARM_PROMISE;
        } else {
          await Font.loadAsync(fontsToLoad);
        }

        if (isActive) {
          loadedFontSetsRef.current.add(fontId);
          setCurrentFontReady(true);
          dispatchBootEvent('FONTS_LOADED');
        }
      } catch {
        // Still allow the app to show (with system fonts) if loading fails
        if (isActive) {
          setCurrentFontReady(true);
          dispatchBootEvent('FONTS_LOADED');
        }
      }
    }

    loadFontSet();

    return () => {
      isActive = false;
    };
    // loadedFontSetsRef is intentionally excluded — it's a ref, not reactive state
  }, [fontId, dispatchBootEvent]);

  // Block the app ONLY during the initial font load of the current theme
  if (!currentFontReady && loadedFontSetsRef.current.size === 0) {
    return null;
  }

  return <>{children}</>;
}
