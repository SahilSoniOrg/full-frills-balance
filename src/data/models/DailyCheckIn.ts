import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import { DailyCheckInId, WorkplaceId } from '@/src/types/domain';
import { date, field } from '@nozbe/watermelondb/decorators';

export default class DailyCheckIn extends BaseScopedModel<DailyCheckInId> {
  static table = 'daily_check_ins' as const;

  static associations = {} as const;

  @field('workplace_id') workplaceId!: WorkplaceId;

  /**
   * The date this check-in applies to, stored as YYYY-MM-DD timestamp (epoch ms at midnight UTC).
   * Allows backdating for the 2-day recovery window.
   */
  @field('check_in_date') checkInDate!: number;

  /**
   * True when the user confirmed they spent nothing (zero-spend day).
   * False or records without this flag are standard check-ins.
   */
  @field('is_zero_spend') isZeroSpend!: boolean;

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
