import { AppConfig } from '@/src/constants/app-config';
import { ThemeIds, FontIds } from '@/src/constants/design-tokens';
import { resolveParsedImportBatchData } from '@/src/services/import/canonicalImportAdapter';
import { validateImportedData } from '@/src/services/import/validateImportedData';
import type {
  ImportFileContext,
  ImportPlugin,
  ParsedImportResult,
} from '@/src/services/import/types';
import { logger } from '@/src/utils/logger';
import type { PreparedRestore, PrepareRestoreOptions, RestoreFacts } from './restoreTypes';

/**
 * A deterministic source identity. This is deliberately local and synchronous: it is a
 * resume guard, not a cryptographic signature. The byte length and two independent FNV
 * accumulators make accidental collisions extremely unlikely for a selected backup.
 */
export function fingerprintRestoreSource(bytes: Uint8Array): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const byte of bytes) {
    first ^= byte;
    first = Math.imul(first, 0x01000193);
    second ^= byte + 0x9e;
    second = Math.imul(second, 0x01000193);
  }
  return `restore-v1:${bytes.byteLength}:${(first >>> 0).toString(16).padStart(8, '0')}:${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function validTheme(value: unknown): value is NonNullable<RestoreFacts['appearance']>['theme'] {
  return value === 'light' || value === 'dark' || value === 'system';
}

function validThemeId(
  value: unknown,
): value is RestoreFacts['appearance'] extends infer T
  ? T extends { themeId?: infer V }
    ? V
    : never
  : never {
  return typeof value === 'string' && Object.values(ThemeIds).includes(value as never);
}

function validFontId(
  value: unknown,
): value is RestoreFacts['appearance'] extends infer T
  ? T extends { fontId?: infer V }
    ? V
    : never
  : never {
  return typeof value === 'string' && Object.values(FontIds).includes(value as never);
}

function factsFromParsed(parsed: ParsedImportResult): RestoreFacts {
  // Canonical metadata is the fallback for plugins that have fully migrated to the
  // canonical contract. The legacy top-level fields remain supported for all existing
  // plugins and are intentionally read-only here.
  const metadata = parsed.canonical?.importMetadata;
  const preferences = parsed.preferences ?? metadata?.preferences;
  const workplace = parsed.workplace ?? metadata?.workplace;
  const importedName = preferences?.userName;
  const importedTheme = preferences?.theme;
  const importedThemeId = preferences?.themeId;
  const importedFontId = preferences?.fontId;
  const importedWorkplaceName = workplace?.name;
  const importedWorkplaceIcon = workplace?.icon;
  const importedCurrency = workplace?.defaultCurrencyCode;
  const appearance = {
    ...(validTheme(importedTheme) ? { theme: importedTheme } : {}),
    ...(validThemeId(importedThemeId) ? { themeId: importedThemeId } : {}),
    ...(validFontId(importedFontId) ? { fontId: importedFontId } : {}),
  };

  return {
    ...(nonEmptyString(importedName) ? { user: { name: nonEmptyString(importedName) } } : {}),
    workplace: {
      ...(nonEmptyString(importedWorkplaceName)
        ? { name: nonEmptyString(importedWorkplaceName) }
        : {}),
      ...(nonEmptyString(importedWorkplaceIcon)
        ? { icon: nonEmptyString(importedWorkplaceIcon) }
        : {}),
      ...(nonEmptyString(importedCurrency)
        ? { defaultCurrencyCode: nonEmptyString(importedCurrency)?.toUpperCase() }
        : {}),
    },
    ...(Object.keys(appearance).length > 0 ? { appearance } : {}),
    ...(parsed.workplacePreferences
      ? { workplacePreferences: { ...parsed.workplacePreferences } }
      : {}),
  };
}

/**
 * Parse and validate an import source without touching the database or preferences.
 * Publication is intentionally a separate call so Setup can resolve missing facts first.
 */
export async function prepareRestore(
  plugin: ImportPlugin,
  context: ImportFileContext,
  options: PrepareRestoreOptions = {},
): Promise<PreparedRestore> {
  const defaultCurrency = options.defaultCurrency ?? (AppConfig.defaultCurrency as string);
  options.onProgress?.(`Parsing ${plugin.name} data...`, 0);

  let parsed: ParsedImportResult;
  try {
    parsed = await plugin.parse(context, {
      defaultCurrency,
      onProgress: options.onProgress,
    });
  } catch (error) {
    logger.warn('[RestorePreparation] Restore parsing failed', { error });
    throw error;
  }

  if (!parsed.canonical) throw new Error('Restore preparation failed: canonical data is required');
  // Resolve and validate the exact graph that publishRestore will persist.
  validateImportedData(resolveParsedImportBatchData(parsed));
  options.onProgress?.('Restore source validated.', 1);

  return {
    fingerprint: fingerprintRestoreSource(context.rawBytes),
    canonicalData: parsed.canonical,
    facts: factsFromParsed(parsed),
    stats: { ...parsed.stats },
    warnings: [],
  };
}
