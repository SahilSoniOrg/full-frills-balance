import { WorkplaceId } from '@/src/types/ids';
import { ParserOutput, TransactionFallbackAIProvider } from './types/ai-parsing';
import { mockAIProvider } from './TransactionFallbackAIProvider';

import { PipelineContext, PipelineStep } from './pipeline/types';
import { ContextGatheringStep } from './pipeline/steps/ContextGatheringStep';
import { DeterministicStep } from './pipeline/steps/DeterministicStep';
import { AiFallbackStep } from './pipeline/steps/AiFallbackStep';

export class TransactionIngestionService {
  private customAiProvider: TransactionFallbackAIProvider | null = null;
  private pipelineSteps: PipelineStep[] = [
    new ContextGatheringStep(),
    new DeterministicStep(),
    new AiFallbackStep(),
  ];

  setAiProvider(provider: TransactionFallbackAIProvider) {
    this.customAiProvider = provider;
  }

  private getEffectiveAiProvider(): TransactionFallbackAIProvider {
    return this.customAiProvider ?? mockAIProvider;
  }

  async ingest(
    transcript: string,
    workplaceId: WorkplaceId,
    forceAi: boolean = false,
  ): Promise<ParserOutput> {
    const context: PipelineContext = {
      transcript,
      workplaceId,
      forceAi,
      startTime: Date.now(),
      aiProvider: this.getEffectiveAiProvider(),
      isHalted: false,
    };

    for (const step of this.pipelineSteps) {
      await step.execute(context);
      if (context.isHalted) break;
    }

    if (!context.result) {
      throw new Error('Pipeline failed to produce a result');
    }

    return context.result;
  }
}

export const transactionIngestionService = new TransactionIngestionService();
