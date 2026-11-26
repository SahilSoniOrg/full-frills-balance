import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import type { PersonId } from '@/src/types/ids';
import { date, field } from '@nozbe/watermelondb/decorators';
export default class Person extends BaseScopedModel<PersonId> {
  static table = 'people';
  @field('name') name!: string;
  @field('notes') notes?: string;
  @field('color') color?: string;
  @date('archived_at') archivedAt?: Date;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @date('deleted_at') deletedAt?: Date;
}
export const toPlainPerson = (x: Person) => ({
  id: x.id,
  name: x.name,
  notes: x.notes,
  color: x.color,
  archivedAt: x.archivedAt?.getTime(),
  createdAt: x.createdAt?.getTime(),
  updatedAt: x.updatedAt?.getTime(),
  deletedAt: x.deletedAt?.getTime(),
});
