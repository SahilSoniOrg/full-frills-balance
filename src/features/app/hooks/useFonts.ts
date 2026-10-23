import { FontIds } from '@/src/constants/design-tokens';
import { useAppReady } from '@/src/contexts/app-shell/appReady';
import { useThemePrefs } from '@/src/hooks/useThemePrefs';
import { logger } from '@/src/utils/logger';
import { useEffect } from 'react';
import { ensureFontSetLoaded } from '@/src/utils/loadFontSet';

/** Resolve the persisted scheme before the splash leaves; failed loads use a real fallback. */
export function useFonts() {
  const { fontId } = useThemePrefs();
  const { setFontsReady } = useAppReady();

  useEffect(() => {
    let isActive = true;

    void (async () => {
      let readyFontId: (typeof FontIds)[keyof typeof FontIds] | null = null;
      try {
        await ensureFontSetLoaded(fontId);
        readyFontId = fontId;
      } catch (error) {
        logger.error(`[Fonts] Failed to load: ${fontId}`, error);
        if (fontId !== FontIds.DEEP_SPACE) {
          try {
            await ensureFontSetLoaded(FontIds.DEEP_SPACE);
            readyFontId = FontIds.DEEP_SPACE;
          } catch (fallbackError) {
            logger.error('[Fonts] Failed to load the fallback font set', fallbackError);
          }
        }
      }
      if (isActive) setFontsReady(true, readyFontId);
    })();

    return () => {
      isActive = false;
    };
  }, [fontId, setFontsReady]);
}
