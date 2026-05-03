import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class BaseScopedModel extends Model {
  @field('workplace_id') workplaceId!: string;
}
