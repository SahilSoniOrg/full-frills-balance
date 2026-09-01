import { AppConfig } from '@/src/constants/app-config';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { storage } from '@/src/utils/storage';
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
      } catch (error) {
        logger.warn('Failed to clear workplace preferences from MMKV', { error });
      }
      return;
    }

    try {
      for (const key of storage.getAllKeys()) {
        if (key.startsWith(WORKPLACE_PREFERENCES_KEY_PREFIX)) storage.remove(key);
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
    delete (sanitized as { isSmsImportEnabled?: boolean }).isSmsImportEnabled;
    if ('dismissedPatternIds' in sanitized && !Array.isArray(sanitized.dismissedPatternIds)) {
      sanitized.dismissedPatternIds = [];
    }
    if ('safeToSpendDays' in sanitized && ![30, 60, 90].includes(sanitized.safeToSpendDays ?? 0)) {
      sanitized.safeToSpendDays = AppConfig.defaults.safeToSpendDays;
    }
    return sanitized;
  }
}
