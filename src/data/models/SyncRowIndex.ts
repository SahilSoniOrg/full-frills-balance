import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import { field } from '@nozbe/watermelondb/decorators';

export default class SyncRowIndex extends BaseScopedModel {
  static table = 'sync_row_index';

  @field('table_name') tableName!: string;
  @field('row_id') rowId!: string;
  @field('content_hash') contentHash!: string;
  @field('leaf_hash') leafHash!: string;
  @field('seq') seq!: number;
}
