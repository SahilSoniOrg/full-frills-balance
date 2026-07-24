import { FontId, ThemeId } from '@/src/constants/design-tokens';
import { Observable } from 'rxjs';
import type { PreferencesStore } from '../PreferencesStore';
import type { ThemeAppearance } from '../types';

/** Theme / typography preferences Interface. */
export class ThemePreferences {
  constructor(private readonly store: PreferencesStore) {}

  get theme(): ThemeAppearance | undefined {
    return this.store.theme;
  }

  setTheme(theme: ThemeAppearance): void {
    this.store.setTheme(theme);
  }

  get themeId(): ThemeId | undefined {
    return this.store.themeId;
  }

  setThemeId(themeId: ThemeId): void {
    this.store.setThemeId(themeId);
  }

  get fontId(): FontId | undefined {
    return this.store.fontId;
  }

  setFontId(fontId: FontId): void {
    this.store.setFontId(fontId);
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
