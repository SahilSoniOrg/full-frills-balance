import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import { date, field, readonly } from '@nozbe/watermelondb/decorators';

export default class FinancialPet extends BaseScopedModel {
  static table = 'financial_pets';

  @field('xp') xp!: number;
  @field('level') level!: number;
  @field('last_fed_at') lastFedAt?: number;
  @field('last_action_date') lastActionDate?: string; // YYYY-MM-DD for daily cap tracking

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
