import BaseScopedModel from '@/src/data/models/BaseScopedModel';
import { field } from '@nozbe/watermelondb/decorators';

export default class SyncCheckpoint extends BaseScopedModel {
  static table = 'sync_checkpoints';

  @field('seq') seq!: number;
  @field('manifest_hash') manifestHash!: string;
  @field('author_device_id') authorDeviceId!: string;
}
