import { toPlainSmsRule } from '@/src/data/models/TransactionAutoPostRule';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { PlainSmsRule } from '@/src/types/plainDtos';
import { WorkplaceId } from '@/src/types/ids';
import { map, Observable } from 'rxjs';

export class SmsRuleReadService {
  observeAll(workplaceId: WorkplaceId): Observable<PlainSmsRule[]> {
    return transactionAutoPostRuleRepository
      .observeAllByWorkplace(workplaceId)
      .pipe(map(rules => rules.map(toPlainSmsRule)));
  }

  async find(workplaceId: WorkplaceId, id: string): Promise<PlainSmsRule | undefined> {
    const rule = await transactionAutoPostRuleRepository.find(workplaceId, id);
    return rule ? toPlainSmsRule(rule) : undefined;
  }
}

export const smsRuleReadService = new SmsRuleReadService();
