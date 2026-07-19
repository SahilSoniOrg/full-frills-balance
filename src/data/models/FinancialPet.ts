import { WorkplaceId } from '@/src/types/domain';
import { Model } from '@nozbe/watermelondb';
import { date, field, readonly } from '@nozbe/watermelondb/decorators';

export default class FinancialPet extends Model {
  static table = 'financial_pets';

  @field('workplace_id') workplaceId!: WorkplaceId;
  @field('xp') xp!: number;
  @field('level') level!: number;
  @field('last_fed_at') lastFedAt?: number;
  @field('last_action_date') lastActionDate?: string; // YYYY-MM-DD for daily cap tracking

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
