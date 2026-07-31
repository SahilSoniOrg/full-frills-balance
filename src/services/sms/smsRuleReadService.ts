import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import { WorkplaceId } from '@/src/types/domain';
import { Observable } from 'rxjs';

export class SmsRuleReadService {
  observeAll(workplaceId: WorkplaceId): Observable<TransactionAutoPostRule[]> {
    return transactionAutoPostRuleRepository.observeAllByWorkplace(workplaceId);
  }

  find(workplaceId: WorkplaceId, id: string): Promise<TransactionAutoPostRule | undefined> {
    return transactionAutoPostRuleRepository.find(workplaceId, id);
  }
}

export const smsRuleReadService = new SmsRuleReadService();
