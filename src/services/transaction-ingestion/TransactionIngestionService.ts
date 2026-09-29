import { workplaceService } from '@/src/services/WorkplaceService';
import type { WorkplaceId } from '@/src/types/ids';
import type { ParserOutput } from './types/ai-parsing';
import type { IngestionContext } from './pipeline/types';
import { DeterministicStep } from './pipeline/steps/DeterministicStep';
import { AiFallbackStep } from './pipeline/steps/AiFallbackStep';

export class TransactionIngestionService {
  async ingest(
    transcript: string,
    workplaceId: WorkplaceId,
    forceAi: boolean = false,
  ): Promise<ParserOutput> {
    const startTime = Date.now();
    const context: IngestionContext = {
      transcript,
      workplaceId,
      forceAi,
      startTime,
      defaultCurrency: await workplaceService.getCurrency(workplaceId),
    };

    await new DeterministicStep().execute(context);
    if (!context.result) await new AiFallbackStep().execute(context);

    if (!context.result) {
      throw new Error('Transaction ingestion failed to produce a result');
    }

    return context.result;
  }
}

export const transactionIngestionService = new TransactionIngestionService();
