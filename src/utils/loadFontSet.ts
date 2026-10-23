import { FontIds, type FontId } from '@/src/constants/design-tokens';
import { logger } from '@/src/utils/logger';
import { loadFontAssets } from '@/src/utils/fontAssets';

const FONT_IDS = new Set<string>(Object.values(FontIds));

const loadedFontSets = new Set<string>();
const inFlight = new Map<string, Promise<void>>();
let commitGeneration = 0;

export function isFontSetLoaded(fontId: string): boolean {
  return loadedFontSets.has(fontId);
}

/** Make one font scheme available before use, including previews and preference commits. */
export async function ensureFontSetLoaded(fontId: string): Promise<void> {
  if (loadedFontSets.has(fontId)) return;
  const pending = inFlight.get(fontId);
  if (pending) return pending;

  if (!FONT_IDS.has(fontId)) {
    throw new Error(`[Fonts] No configuration found for: ${fontId}`);
  }

  const load = (async () => {
    const start = performance.now();
    logger.info(`[Fonts] Preparing font set: ${fontId}`);
    await loadFontAssets(fontId as FontId);
    loadedFontSets.add(fontId);
    logger.info(`[Fonts] Font set ready: ${fontId} in ${Math.round(performance.now() - start)}ms`);
  })();

  inFlight.set(fontId, load);
  try {
    await load;
  } finally {
    inFlight.delete(fontId);
  }
}

/** Warm every scheme so picker previews never apply an unloaded family. */
export async function ensureAllFontSetsLoaded(): Promise<void> {
  await Promise.all(Object.values(FontIds).map(id => ensureFontSetLoaded(id)));
}

/**
 * Load files first, then commit. Last tap wins if the user switches quickly.
 */
export async function commitFontIdAfterLoad(
  fontId: string,
  commit: (fontId: string) => void,
): Promise<void> {
  const generation = ++commitGeneration;
  await ensureFontSetLoaded(fontId);
  if (generation !== commitGeneration) return;
  commit(fontId);
}

export function resetLoadedFontSetsForTests(): void {
  loadedFontSets.clear();
  inFlight.clear();
  commitGeneration = 0;
}
