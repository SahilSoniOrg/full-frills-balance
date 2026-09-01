import { FontId, ThemeId } from '@/src/constants/design-tokens';
import { Observable } from 'rxjs';
import type { PreferencesStore } from '../PreferencesStore';
import type { ThemeAppearance } from '../types';

/** Theme / typography preferences Interface. */
export class ThemePreferences {
  constructor(private readonly store: PreferencesStore) {}

  get theme(): ThemeAppearance | undefined {
    return this.store.getSnapshot().theme;
  }

  setTheme(theme: ThemeAppearance): void {
    this.store.update({ theme });
  }

  get themeId(): ThemeId | undefined {
    return this.store.getSnapshot().themeId;
  }

  setThemeId(themeId: ThemeId): void {
    this.store.update({ themeId });
  }

  get fontId(): FontId | undefined {
    return this.store.getSnapshot().fontId;
  }

  setFontId(fontId: FontId): void {
    this.store.update({ fontId });
  }

  observeTheme(): Observable<ThemeAppearance | undefined> {
    return this.store.observe('theme');
  }

  observeThemeId(): Observable<ThemeId | undefined> {
    return this.store.observe('themeId');
  }

  observeFontId(): Observable<FontId | undefined> {
    return this.store.observe('fontId');
  }
}
