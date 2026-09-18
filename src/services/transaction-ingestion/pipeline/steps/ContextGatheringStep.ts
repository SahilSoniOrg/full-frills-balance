import { accountQueryRepository } from '@/src/data/repositories/account';
import { workplaceService } from '@/src/services/WorkplaceService';
import { PipelineContext, PipelineStep } from '../types';

export class ContextGatheringStep implements PipelineStep {
  async execute(context: PipelineContext): Promise<void> {
    const defaultCurrency = await workplaceService.getCurrency(context.workplaceId);

    const allAccounts = await accountQueryRepository.findAll(context.workplaceId);

    context.defaultCurrency = defaultCurrency;
    context.allAccounts = allAccounts;
  }
}
