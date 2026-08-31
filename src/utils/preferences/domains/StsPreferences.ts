import { AppConfig } from '@/src/constants/app-config';
import { WorkplaceId } from '@/src/types/ids';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import type { DevicePreferencesStore } from '../DevicePreferencesStore';
import type { WorkplacePreferencesStore } from '../WorkplacePreferencesStore';

/** Safe-to-Spend forecast horizon — workplace bag. */
export class StsPreferences {
  constructor(
    private readonly workplace: WorkplacePreferencesStore,
    private readonly device: DevicePreferencesStore,
  ) {}

  get safeToSpendDays(): number {
    return this.forWorkplace(this.requireActiveWorkplaceId());
  }

  setSafeToSpendDays(days: number): void {
    const workplaceId = this.device.activeWorkplaceId;
    if (!workplaceId) return;
    this.workplace.update(workplaceId, { safeToSpendDays: days });
  }

  forWorkplace(workplaceId: WorkplaceId | undefined): number {
    if (!workplaceId) return AppConfig.defaults.safeToSpendDays;
    return this.workplace.getSnapshot(workplaceId).safeToSpendDays;
  }

  observeSafeToSpendDays(): Observable<number> {
    return this.device
      .observe('activeWorkplaceId')
      .pipe(
        switchMap(workplaceId =>
          workplaceId
            ? this.workplace.observe(workplaceId, 'safeToSpendDays')
            : of(AppConfig.defaults.safeToSpendDays),
        ),
      );
  }

  observeForWorkplace(workplaceId: WorkplaceId): Observable<number> {
    return this.workplace.observe(workplaceId, 'safeToSpendDays');
  }

  private requireActiveWorkplaceId(): WorkplaceId | undefined {
    return this.device.activeWorkplaceId;
  }
}
