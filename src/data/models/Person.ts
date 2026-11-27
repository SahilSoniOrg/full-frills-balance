import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import type { IconName } from '@/src/types/domainIcons';
import type { PersonId } from '@/src/types/ids';
import { date, field } from '@nozbe/watermelondb/decorators';
export default class Person extends BaseScopedModel<PersonId> {
  static table = 'people';
  @field('name') name!: string;
  @field('notes') notes?: string;
  @field('icon') icon?: IconName;
  @field('color') color?: string;
  @field('default_currency_code') defaultCurrencyCode?: string;
  @field('payment_handle') paymentHandle?: string;
  @field('phone') phone?: string;
  @field('email') email?: string;
  @field('is_pinned') isPinned?: boolean;
  @date('archived_at') archivedAt?: Date;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @date('deleted_at') deletedAt?: Date;
}
