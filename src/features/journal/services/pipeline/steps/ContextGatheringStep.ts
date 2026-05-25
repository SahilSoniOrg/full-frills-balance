import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import { workplaceService } from '@/src/services/WorkplaceService';
import { Q } from '@nozbe/watermelondb';
import { PipelineContext, PipelineStep } from '../types';

export class ContextGatheringStep implements PipelineStep {
  async execute(context: PipelineContext): Promise<void> {
    const defaultCurrency = await workplaceService.getCurrency(context.workplaceId);

    const allAccounts = await database.collections
      .get<Account>('accounts')
      .query(Q.where('workplace_id', context.workplaceId), Q.where('deleted_at', Q.eq(null)))
      .fetch();

    context.defaultCurrency = defaultCurrency;
    context.allAccounts = allAccounts;
  }
}
