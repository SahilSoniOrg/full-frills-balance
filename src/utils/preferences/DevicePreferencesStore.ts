import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { storage } from '../storage';
import {
  DEFAULT_DEVICE_PREFERENCES,
  DEVICE_PREFERENCES_KEY,
  DevicePreferenceKey,
  DevicePreferences,
} from './deviceTypes';

export class DevicePreferencesStore {
  private preferences: DevicePreferences = { ...DEFAULT_DEVICE_PREFERENCES };
  private subject = new BehaviorSubject<DevicePreferences>(DEFAULT_DEVICE_PREFERENCES);

  constructor() {
    this.reload();
  }

  reload(): void {
    this.reloadFromStorage();
  }

  /** Persist the current snapshot when recovery had to synthesize the bag. */
  persist(): void {
    this.save(this.preferences);
    this.subject.next(this.preferences);
  }

  getSnapshot(): DevicePreferences {
    return this.preferences;
  }

  observe<K extends DevicePreferenceKey>(key: K): Observable<DevicePreferences[K]> {
    return this.subject.asObservable().pipe(
      map(p => p[key]),
      distinctUntilChanged(),
    );
  }

  update(updates: Partial<DevicePreferences>): void {
    const next = { ...this.preferences, ...updates };
    this.save(next);
    this.preferences = next;
    this.subject.next(next);
  }

  get deviceRegistered(): boolean {
    return this.preferences.deviceRegistered;
  }

  setDeviceRegistered(registered: boolean): void {
    this.update({ deviceRegistered: registered });
  }

  get isAppLockEnabled(): boolean {
    return this.preferences.isAppLockEnabled;
  }

  setAppLockEnabled(isAppLockEnabled: boolean): void {
    this.update({ isAppLockEnabled });
  }

  get activeWorkplaceId(): WorkplaceId | undefined {
    return this.preferences.activeWorkplaceId;
  }

  setActiveWorkplaceId(workplaceId?: WorkplaceId): void {
    this.update({ activeWorkplaceId: workplaceId });
  }

  get anonymizedId(): string | undefined {
    return this.preferences.anonymizedId;
  }

  setAnonymizedId(id: string): void {
    this.update({ anonymizedId: id });
  }

  get isSmsImportEnabled(): boolean {
    return this.preferences.isSmsImportEnabled;
  }

  setSmsImportEnabled(enabled: boolean): void {
    this.update({ isSmsImportEnabled: enabled });
  }

  clear(): void {
    this.preferences = { ...DEFAULT_DEVICE_PREFERENCES };
    this.subject.next(this.preferences);
    try {
      storage.remove(DEVICE_PREFERENCES_KEY);
    } catch (error) {
      logger.warn('Failed to clear device preferences from MMKV', { error });
    }
  }

  private reloadFromStorage(): void {
    try {
      const stored = storage.getString(DEVICE_PREFERENCES_KEY);
      if (!stored) {
        this.preferences = { ...DEFAULT_DEVICE_PREFERENCES };
        this.subject.next(this.preferences);
        return;
      }
      this.preferences = this.sanitize(JSON.parse(stored));
      this.subject.next(this.preferences);
    } catch (error) {
      logger.error('Failed to reload device preferences from MMKV', { error });
    }
  }

  private sanitize(input: unknown): DevicePreferences {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return { ...DEFAULT_DEVICE_PREFERENCES };
    }
    const value = input as Record<string, unknown>;
    return {
      ...DEFAULT_DEVICE_PREFERENCES,
      ...(typeof value.deviceRegistered === 'boolean'
        ? { deviceRegistered: value.deviceRegistered }
        : typeof value.onboardingCompleted === 'boolean'
          ? { deviceRegistered: value.onboardingCompleted }
          : {}),
      ...(typeof value.isAppLockEnabled === 'boolean'
        ? { isAppLockEnabled: value.isAppLockEnabled }
        : {}),
      ...(typeof value.anonymizedId === 'string' ? { anonymizedId: value.anonymizedId } : {}),
      ...(typeof value.activeWorkplaceId === 'string' && value.activeWorkplaceId
        ? { activeWorkplaceId: value.activeWorkplaceId as WorkplaceId }
        : {}),
      ...(typeof value.isSmsImportEnabled === 'boolean'
        ? { isSmsImportEnabled: value.isSmsImportEnabled }
        : {}),
    };
  }

  private save(preferences: DevicePreferences): void {
    try {
      storage.set(DEVICE_PREFERENCES_KEY, JSON.stringify(preferences));
    } catch (error) {
      logger.error('Failed to save device preferences to MMKV', { error });
      throw error;
    }
  }
}
