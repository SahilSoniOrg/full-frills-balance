import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';
import { WorkplaceId } from '@/src/types/domain';

export default class BaseScopedModel extends Model {
  @field('workplace_id') workplaceId!: WorkplaceId;
}
