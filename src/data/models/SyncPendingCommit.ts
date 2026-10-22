import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import { date, field, readonly } from '@nozbe/watermelondb/decorators';

export default class SyncPendingCommit extends BaseScopedModel {
  static table = 'sync_pending_commits';

  @field('seq') seq!: number;
  @field('manifest_json') manifestJson!: string;
  @field('envelopes_json') envelopesJson!: string;
  @field('reason') reason!: string;
  @readonly @date('created_at') createdAt!: Date;
}
