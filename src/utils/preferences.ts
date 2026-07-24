/**
 * Preferences package entry — re-exports the domain-split Module.
 * Prefer `preferences.themePrefs` / `.ai` / `.sms` / `.sts` / `.privacy` / `.insights`
 * for new call sites; flat getters remain for compatibility.
 */
export * from './preferences/index';
