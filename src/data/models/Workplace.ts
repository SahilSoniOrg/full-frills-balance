import { PlainWorkplace } from '@/src/types/plainDtos';
import { WorkplaceId } from '@/src/types/ids';
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

export function toPlainWorkplace(workplace: Workplace): PlainWorkplace {
  return {
    id: workplace.id,
    name: workplace.name,
    icon: workplace.icon,
    defaultCurrencyCode: workplace.defaultCurrencyCode,
  };
}
