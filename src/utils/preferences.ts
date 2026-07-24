/**
 * Preferences package entry — re-exports the domain-split Module.
 * Prefer `preferences.themePrefs` / `.ai` / `.sms` / `.sts` / `.privacy` /
 * `.notifications` / `.insights` / `.journalNav` for domain keys;
 * flat getters remain only for keys without domains.
 */
export * from './preferences/index';
