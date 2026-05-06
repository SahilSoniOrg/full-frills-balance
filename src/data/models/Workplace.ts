import { WorkplaceId } from '@/src/types/domain';
import { Model } from '@nozbe/watermelondb';
import { date, field } from '@nozbe/watermelondb/decorators';

export default class Workplace extends Model {
  static table = 'workplaces';

  // Override id to support branded nominal types
  get id(): WorkplaceId {
    return super.id as WorkplaceId;
  }

  @field('name') name!: string;
  @field('icon') icon!: string;
  @field('default_currency_code') defaultCurrencyCode!: string;

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
