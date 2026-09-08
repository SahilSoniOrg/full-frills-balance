import { isValidIconName, type IconName } from '@/src/types/domainIcons';
import { PlainWorkplace } from '@/src/types/plainDtos';
import { WorkplaceId } from '@/src/types/ids';
import { Model } from '@nozbe/watermelondb';
import { date, field } from '@nozbe/watermelondb/decorators';

export const DEFAULT_WORKPLACE_ICON: IconName = 'briefcase';

export function toWorkplaceIcon(icon: string | undefined): IconName {
  return isValidIconName(icon) ? icon : DEFAULT_WORKPLACE_ICON;
}

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
    icon: toWorkplaceIcon(workplace.icon),
    defaultCurrencyCode: workplace.defaultCurrencyCode,
  };
}
