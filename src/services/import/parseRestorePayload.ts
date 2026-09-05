import { FontIds, ThemeIds, type FontId, type ThemeId } from '@/src/constants/design-tokens';
import type { WorkplaceId } from '@/src/types/ids';
import { asWorkplaceId } from '@/src/types/ids';
import type { ImportStats } from './types';
import type { RestoreFacts, RestoreHandoff } from './restoreTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalNonEmptyString(value: unknown): string | undefined {
  return value === undefined ? undefined : nonEmptyString(value) ? value : undefined;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseThemeId(value: unknown): ThemeId | undefined {
  return typeof value === 'string' && Object.values(ThemeIds).includes(value as ThemeId)
    ? (value as ThemeId)
    : undefined;
}

function parseFontId(value: unknown): FontId | undefined {
  return typeof value === 'string' && Object.values(FontIds).includes(value as FontId)
    ? (value as FontId)
    : undefined;
}

function parseThemeAppearance(value: unknown): 'light' | 'dark' | 'system' | undefined {
  return value === 'light' || value === 'dark' || value === 'system' ? value : undefined;
}

/** Structural restore facts. Extra keys are ignored so import can grow without breaking Setup. */
export function parseRestoreFacts(value: unknown): RestoreFacts | undefined {
  if (!isRecord(value) || !isRecord(value.workplace)) return undefined;

  const workplaceName = optionalNonEmptyString(value.workplace.name);
  const workplaceIcon = optionalNonEmptyString(value.workplace.icon);
  const baseCurrency = optionalNonEmptyString(value.workplace.defaultCurrencyCode);
  if (
    (value.workplace.name !== undefined && !workplaceName) ||
    (value.workplace.icon !== undefined && !workplaceIcon) ||
    (value.workplace.defaultCurrencyCode !== undefined && !baseCurrency)
  ) {
    return undefined;
  }

  let user: RestoreFacts['user'];
  if (value.user !== undefined) {
    if (!isRecord(value.user)) return undefined;
    const name = optionalNonEmptyString(value.user.name);
    if (value.user.name !== undefined && !name) return undefined;
    user = name === undefined ? {} : { name };
  }

  let appearance: RestoreFacts['appearance'];
  if (value.appearance !== undefined) {
    if (!isRecord(value.appearance)) return undefined;
    const theme =
      value.appearance.theme === undefined
        ? undefined
        : parseThemeAppearance(value.appearance.theme);
    const themeId =
      value.appearance.themeId === undefined ? undefined : parseThemeId(value.appearance.themeId);
    const fontId =
      value.appearance.fontId === undefined ? undefined : parseFontId(value.appearance.fontId);
    if (
      (value.appearance.theme !== undefined && !theme) ||
      (value.appearance.themeId !== undefined && !themeId) ||
      (value.appearance.fontId !== undefined && !fontId)
    ) {
      return undefined;
    }
    appearance = {
      ...(theme === undefined ? {} : { theme }),
      ...(themeId === undefined ? {} : { themeId }),
      ...(fontId === undefined ? {} : { fontId }),
    };
  }

  if (value.workplacePreferences !== undefined && !isRecord(value.workplacePreferences)) {
    return undefined;
  }

  return {
    ...(user === undefined ? {} : { user }),
    workplace: {
      ...(workplaceName === undefined ? {} : { name: workplaceName }),
      ...(workplaceIcon === undefined ? {} : { icon: workplaceIcon }),
      ...(baseCurrency === undefined ? {} : { defaultCurrencyCode: baseCurrency }),
    },
    ...(appearance === undefined ? {} : { appearance }),
    ...(value.workplacePreferences === undefined
      ? {}
      : {
          workplacePreferences: value.workplacePreferences as RestoreFacts['workplacePreferences'],
        }),
  };
}

function parseSkippedItem(
  value: unknown,
): NonNullable<ImportStats['skippedItems']>[number] | undefined {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.reason)) {
    return undefined;
  }
  if (value.description !== undefined && typeof value.description !== 'string') return undefined;
  return {
    id: value.id,
    reason: value.reason,
    ...(value.description ? { description: value.description } : {}),
  };
}

function parseSkippedItems(value: unknown): ImportStats['skippedItems'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const skippedItems = value
    .map(parseSkippedItem)
    .filter((item): item is NonNullable<typeof item> => item !== undefined);
  return skippedItems.length > 0 ? skippedItems : undefined;
}

export function parseRestoreStats(value: unknown): ImportStats | undefined {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.accounts) ||
    !isNonNegativeInteger(value.journals) ||
    !isNonNegativeInteger(value.transactions) ||
    !isNonNegativeInteger(value.skippedTransactions)
  ) {
    return undefined;
  }
  const skippedItems = parseSkippedItems(value.skippedItems);
  return {
    accounts: value.accounts,
    ...(isNonNegativeInteger(value.categories) ? { categories: value.categories } : {}),
    journals: value.journals,
    transactions: value.transactions,
    skippedTransactions: value.skippedTransactions,
    ...(nonEmptyString(value.workplaceId) ? { workplaceId: value.workplaceId } : {}),
    ...(isNonNegativeInteger(value.budgets) ? { budgets: value.budgets } : {}),
    ...(isNonNegativeInteger(value.auditLogs) ? { auditLogs: value.auditLogs } : {}),
    ...(isNonNegativeInteger(value.plannedPayments)
      ? { plannedPayments: value.plannedPayments }
      : {}),
    ...(skippedItems === undefined ? {} : { skippedItems }),
    ...(nonEmptyString(value.preImportBackupPath)
      ? { preImportBackupPath: value.preImportBackupPath }
      : {}),
  };
}

/** Resume-safe handoff. Operation ID must match the Setup draft. Extra keys are ignored. */
export function parseRestoreHandoff(
  value: unknown,
  operationId: WorkplaceId,
): RestoreHandoff | undefined {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.operationId) ||
    !nonEmptyString(value.workplaceId)
  ) {
    return undefined;
  }
  if (value.operationId !== operationId || !nonEmptyString(value.fingerprint)) return undefined;
  const facts = parseRestoreFacts(value.facts);
  const stats = parseRestoreStats(value.stats);
  if (
    !facts ||
    !stats ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every(item => typeof item === 'string')
  ) {
    return undefined;
  }
  return {
    operationId: asWorkplaceId(value.operationId),
    workplaceId: asWorkplaceId(value.workplaceId),
    fingerprint: value.fingerprint,
    facts,
    stats,
    warnings: value.warnings,
  };
}
