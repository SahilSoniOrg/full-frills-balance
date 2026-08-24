import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import {
  dispositionForRuleAccounts,
  mapOptionalRuleAccountId,
  syncRuleActionsFromColumns,
} from '@/src/utils/sms/ruleActionsAccountIds';

describe('ruleActionsAccountIds', () => {
  describe('syncRuleActionsFromColumns', () => {
    it('rewrites actionsJson to column accounts and keeps auto_post when both exist', () => {
      const result = syncRuleActionsFromColumns(
        JSON.stringify({
          disposition: 'auto_post',
          sourceAccountId: 'stale-source',
          categoryAccountId: 'stale-category',
          journalDescription: 'Olive food',
        }),
        {
          sourceAccountId: 'new-source' as AccountId,
          categoryAccountId: 'new-category' as AccountId,
        },
      );

      expect(JSON.parse(result)).toEqual({
        disposition: 'auto_post',
        sourceAccountId: 'new-source',
        categoryAccountId: 'new-category',
        journalDescription: 'Olive food',
      });
    });

    it('demotes auto_post to review when an account is missing', () => {
      const result = syncRuleActionsFromColumns(
        JSON.stringify({
          disposition: 'auto_post',
          sourceAccountId: 'stale-source',
          categoryAccountId: 'stale-category',
        }),
        {
          sourceAccountId: 'new-source' as AccountId,
          categoryAccountId: EMPTY_ACCOUNT_ID,
        },
      );

      expect(JSON.parse(result)).toEqual({
        disposition: 'review',
        sourceAccountId: 'new-source',
      });
    });

    it('works from empty json during merge-style updates', () => {
      const result = syncRuleActionsFromColumns(undefined, {
        sourceAccountId: 'merged' as AccountId,
        categoryAccountId: 'cat' as AccountId,
      });

      expect(JSON.parse(result)).toEqual({
        disposition: 'auto_post',
        sourceAccountId: 'merged',
        categoryAccountId: 'cat',
      });
    });
  });

  describe('dispositionForRuleAccounts', () => {
    it('requires review when either account leg is missing', () => {
      expect(dispositionForRuleAccounts('auto_post', 'src', '')).toBe('review');
      expect(dispositionForRuleAccounts('auto_post', '', 'cat')).toBe('review');
      expect(dispositionForRuleAccounts('auto_post', undefined, 'cat')).toBe('review');
    });

    it('keeps auto_post when both legs exist', () => {
      expect(dispositionForRuleAccounts('auto_post', 'src', 'cat')).toBe('auto_post');
    });

    it('keeps ignore even without accounts', () => {
      expect(dispositionForRuleAccounts('ignore', '', '')).toBe('ignore');
    });
  });

  describe('mapOptionalRuleAccountId', () => {
    it('returns empty id when the account is missing', () => {
      expect(mapOptionalRuleAccountId(new Map(), 'gone')).toBe(EMPTY_ACCOUNT_ID);
    });
  });
});
