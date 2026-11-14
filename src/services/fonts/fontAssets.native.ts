import type { FontId } from '@/src/constants/design-tokens';

/** Native font files are registered by the expo-font config plugin at build time. */
export function loadFontAssets(_fontId: FontId): Promise<void> {
  return Promise.resolve();
}
