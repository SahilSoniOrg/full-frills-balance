import { database } from '@/src/data/database/Database';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { AccountId, WorkplaceId } from '@/src/types/domain';

describe('TransactionAutoPostRuleRepository', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  });

  it('creates, finds, updates and deletes a rule', async () => {
    const wpId = 'wp-1' as WorkplaceId;
    const rule = await transactionAutoPostRuleRepository.save(
      {
        mode: 'regex',
        senderMatch: 'HDFCBK',
        bodyMatch: 'test',
        conditions: [],
        actions: {
          disposition: 'auto_post',
          sourceAccountId: 'acc-1' as AccountId,
          categoryAccountId: 'acc-2' as AccountId,
        },
        isActive: true,
        priority: 150,
      },
      wpId,
    );

    expect(rule.id).toBeTruthy();
    expect(rule.senderMatch).toBe('HDFCBK');
    expect(rule.bodyMatch).toBe('test');
    expect(rule.priority).toBe(150);

    const found = await transactionAutoPostRuleRepository.find(rule.id);
    expect(found).toBeTruthy();
    expect(found?.id).toBe(rule.id);

    const all = await transactionAutoPostRuleRepository.findAllByWorkplace(wpId);
    expect(all).toHaveLength(1);

    // Update
    await transactionAutoPostRuleRepository.save(
      {
        id: rule.id,
        mode: 'regex',
        senderMatch: 'HDFCBK_UPDATED',
        conditions: [],
        actions: {
          disposition: 'review',
        },
        isActive: false,
        priority: 200,
      },
      wpId,
    );

    const updated = await transactionAutoPostRuleRepository.find(rule.id);
    expect(updated?.senderMatch).toBe('HDFCBK_UPDATED');
    expect(updated?.isActive).toBe(false);
    expect(updated?.priority).toBe(200);

    // Delete
    await transactionAutoPostRuleRepository.delete(rule.id);
    const deleted = await transactionAutoPostRuleRepository.find(rule.id);
    expect(deleted).toBeUndefined();
  });
});
