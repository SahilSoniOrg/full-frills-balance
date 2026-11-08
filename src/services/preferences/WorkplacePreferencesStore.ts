import { AppConfig } from '@/src/constants/app-config';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { storage } from '@/src/utils/storage';
import { parseCategoryDefaults } from '@/src/domain/transaction-intelligence/categoryDefaults';
import { GMAIL_BINDING_KEY_PREFIX, gmailBindingKey } from '@/src/utils/gmailBindingKey';
import {
  DEFAULT_WORKPLACE_PREFERENCES,
  WORKPLACE_PREFERENCES_KEY_PREFIX,
  WorkplacePreferenceKey,
  WorkplacePreferences,
  workplacePreferencesStorageKey,
} from './workplaceTypes';

export class WorkplacePreferencesStore {
  private cache = new Map<string, WorkplacePreferences>();
  private subjects = new Map<string, BehaviorSubject<WorkplacePreferences>>();

  getSnapshot(workplaceId: WorkplaceId): WorkplacePreferences {
    const cached = this.cache.get(workplaceId);
    if (cached) return cached;
    const loaded = this.load(workplaceId);
    this.cache.set(workplaceId, loaded);
    return loaded;
  }

  update(workplaceId: WorkplaceId, patch: Partial<WorkplacePreferences>): void {
    const next: WorkplacePreferences = {
      ...this.getSnapshot(workplaceId),
      ...this.sanitize(patch),
    };
    this.persist(workplaceId, next);
  }

  replace(workplaceId: WorkplaceId, value: Partial<WorkplacePreferences>): void {
    // A restored Workplace must reconnect explicitly on this device.
    storage.remove(gmailBindingKey(workplaceId));
    this.persist(workplaceId, {
      ...DEFAULT_WORKPLACE_PREFERENCES,
      ...this.sanitize(value),
    });
  }

  observe<K extends WorkplacePreferenceKey>(
    workplaceId: WorkplaceId,
    key: K,
  ): Observable<WorkplacePreferences[K]> {
    return this.subject(workplaceId).pipe(
      map(prefs => prefs[key]),
      distinctUntilChanged(),
    );
  }

  clear(workplaceId?: WorkplaceId): void {
    if (workplaceId) {
      this.cache.delete(workplaceId);
      this.subjects.get(workplaceId)?.next({ ...DEFAULT_WORKPLACE_PREFERENCES });
      this.subjects.delete(workplaceId);
      try {
        storage.remove(workplacePreferencesStorageKey(workplaceId));
        storage.remove(gmailBindingKey(workplaceId));
      } catch (error) {
        logger.warn('Failed to clear workplace preferences from MMKV', { error });
      }
      return;
    }

    try {
      for (const key of storage.getAllKeys()) {
        if (
          key.startsWith(WORKPLACE_PREFERENCES_KEY_PREFIX) ||
          key.startsWith(GMAIL_BINDING_KEY_PREFIX)
        )
          storage.remove(key);
      }
    } catch (error) {
      logger.warn('Failed to clear all workplace preferences from MMKV', { error });
    }
    this.cache.clear();
    for (const subject of this.subjects.values()) {
      subject.next({ ...DEFAULT_WORKPLACE_PREFERENCES });
    }
    this.subjects.clear();
  }

  private subject(workplaceId: WorkplaceId): BehaviorSubject<WorkplacePreferences> {
    const existing = this.subjects.get(workplaceId);
    if (existing) return existing;
    const created = new BehaviorSubject(this.getSnapshot(workplaceId));
    this.subjects.set(workplaceId, created);
    return created;
  }

  private load(workplaceId: WorkplaceId): WorkplacePreferences {
    try {
      const stored = storage.getString(workplacePreferencesStorageKey(workplaceId));
      if (!stored) return { ...DEFAULT_WORKPLACE_PREFERENCES };
      const parsed = JSON.parse(stored) as Partial<WorkplacePreferences>;
      if (typeof parsed !== 'object' || parsed === null) {
        return { ...DEFAULT_WORKPLACE_PREFERENCES };
      }
      return { ...DEFAULT_WORKPLACE_PREFERENCES, ...this.sanitize(parsed) };
    } catch (error) {
      logger.error('Failed to reload workplace preferences from MMKV', { error });
      return { ...DEFAULT_WORKPLACE_PREFERENCES };
    }
  }

  private persist(workplaceId: WorkplaceId, next: WorkplacePreferences): void {
    try {
      storage.set(workplacePreferencesStorageKey(workplaceId), JSON.stringify(next));
    } catch (error) {
      logger.error('Failed to save workplace preferences to MMKV', { error });
      throw error;
    }
    this.cache.set(workplaceId, next);
    const subject = this.subjects.get(workplaceId);
    if (subject) subject.next(next);
    else this.subjects.set(workplaceId, new BehaviorSubject(next));
  }

  private sanitize(input: Partial<WorkplacePreferences>): Partial<WorkplacePreferences> {
    const sanitized = { ...input };
    if ('captureCategoryDefaults' in sanitized) {
      sanitized.captureCategoryDefaults = parseCategoryDefaults(sanitized.captureCategoryDefaults);
    }
    if ('historicalSmsCaptureBackfillVersion' in sanitized) {
      sanitized.historicalSmsCaptureBackfillVersion =
        sanitized.historicalSmsCaptureBackfillVersion === 1 ? 1 : undefined;
    }
    if ('captureDescriptionDefaults' in sanitized) {
      const value = sanitized.captureDescriptionDefaults;
      sanitized.captureDescriptionDefaults =
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value).filter(
                ([key, description]) =>
                  !!key &&
                  typeof description === 'string' &&
                  !!description.trim() &&
                  description.length <= 200,
              ),
            )
          : {};
    }
    if ('openCaptureMerchants' in sanitized) {
      sanitized.openCaptureMerchants = Array.isArray(sanitized.openCaptureMerchants)
        ? [
            ...new Set(
              sanitized.openCaptureMerchants
                .filter((value): value is string => typeof value === 'string' && !!value.trim())
                .map(value => value.trim().toLowerCase()),
            ),
          ]
        : [];
    }
    if ('automaticTransactionCapture' in sanitized) {
      const value = sanitized.automaticTransactionCapture;
      const enabledAt = value?.enabledAt;
      sanitized.automaticTransactionCapture = {
        enabled:
          value?.enabled === true &&
          typeof enabledAt === 'number' &&
          Number.isFinite(enabledAt) &&
          enabledAt > 0,
        enabledAt:
          typeof enabledAt === 'number' && Number.isFinite(enabledAt) && enabledAt > 0
            ? enabledAt
            : undefined,
        uncategorizedAccountIds: Object.fromEntries(
          Object.entries(value?.uncategorizedAccountIds ?? {}).filter(
            ([key, id]) =>
              /^(expense|income):[A-Z]{3}$/.test(key) && typeof id === 'string' && id.length > 0,
          ),
        ),
      };
    }
    delete (sanitized as { isSmsImportEnabled?: boolean }).isSmsImportEnabled;
    if ('dismissedPatternIds' in sanitized && !Array.isArray(sanitized.dismissedPatternIds)) {
      sanitized.dismissedPatternIds = [];
    }
    if ('accountMatcherSuppressions' in sanitized) {
      const value = sanitized.accountMatcherSuppressions;
      sanitized.accountMatcherSuppressions = Array.isArray(value)
        ? value.filter(
            item =>
              !!item &&
              typeof item.accountId === 'string' &&
              item.accountId.length > 0 &&
              typeof item.conditionsKey === 'string' &&
              (item.reason === 'dismissed' || item.reason === 'forgotten'),
          )
        : [];
    }
    if ('accountMatcherRefreshPending' in sanitized) {
      sanitized.accountMatcherRefreshPending = sanitized.accountMatcherRefreshPending === true;
    }
    if ('safeToSpendDays' in sanitized && ![30, 60, 90].includes(sanitized.safeToSpendDays ?? 0)) {
      sanitized.safeToSpendDays = AppConfig.defaults.safeToSpendDays;
    }
    return sanitized;
  }
}
