import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';
import { WorkplaceId } from '@/src/types/domain';

export default class BaseScopedModel<ID extends string = string> extends Model {
  @field('workplace_id') workplaceId!: WorkplaceId;

  // Override id to support branded nominal types in subclasses
  get id(): ID {
    return super.id as ID;
  }
}
