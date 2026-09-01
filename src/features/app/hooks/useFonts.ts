import { useAppReady } from '@/src/contexts/app-shell/appReady';
import { useThemePrefs } from '@/src/hooks/useThemePrefs';
import { logger } from '@/src/utils/logger';
import { useEffect } from 'react';
import { ensureFontSetLoaded } from '@/src/utils/loadFontSet';

/**
 * Load the persisted font scheme before marking the shell ready.
 * Marking ready first left Setup on the system fallback, and a second
 * ready call with the same id did not re-render AppText onto the files.
 */
export function useFonts() {
  const { fontId } = useThemePrefs();
  const { setFontsReady } = useAppReady();

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        await ensureFontSetLoaded(fontId);
      } catch (error) {
        logger.error(`[Fonts] Failed to load: ${fontId}`, error);
      }
      if (isActive) setFontsReady(true, fontId);
    })();

    return () => {
      isActive = false;
    };
  }, [fontId, setFontsReady]);
}
