import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import { date, field, readonly } from '@nozbe/watermelondb/decorators';

export default class SyncConflict extends BaseScopedModel {
  static table = 'sync_conflicts';

  @field('group_key') groupKey!: string;
  @field('local_rows_json') localRowsJson!: string;
  @field('remote_seq') remoteSeq!: number;
  @readonly @date('created_at') createdAt!: Date;
}
