import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import {
  accountIdsFromRuleActionsJson,
  dispositionForRuleAccounts,
  mapOptionalRuleAccountId,
  remapRuleActionsJson,
  rewriteRuleActionsAccountIds,
  sanitizeRuleActionsForImport,
} from '@/src/services/sms/ruleActionsAccountIds';

describe('ruleActionsAccountIds', () => {
  describe('remapRuleActionsJson', () => {
    it('remaps source and category account ids', () => {
      const accountMap = new Map<string, AccountId>([
        ['old-source', 'new-source' as AccountId],
        ['old-category', 'new-category' as AccountId],
      ]);

      const result = remapRuleActionsJson(
        JSON.stringify({
          disposition: 'auto_post',
          sourceAccountId: 'old-source',
          categoryAccountId: 'old-category',
          journalDescription: 'Lunch',
        }),
        accountMap,
      );

      expect(JSON.parse(result!)).toEqual({
        disposition: 'auto_post',
        sourceAccountId: 'new-source',
        categoryAccountId: 'new-category',
        journalDescription: 'Lunch',
      });
    });

    it('drops account ids that are missing from the map', () => {
      const result = remapRuleActionsJson(
        JSON.stringify({
          disposition: 'auto_post',
          sourceAccountId: 'missing',
          categoryAccountId: 'also-missing',
        }),
        new Map(),
      );

      expect(JSON.parse(result!)).toEqual({ disposition: 'auto_post' });
    });

    it('returns undefined for undefined input', () => {
      expect(remapRuleActionsJson(undefined, new Map())).toBeUndefined();
    });
  });

  describe('sanitizeRuleActionsForImport', () => {
    it('rewrites actionsJson to remapped columns and keeps auto_post when both exist', () => {
      const result = sanitizeRuleActionsForImport(
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

      expect(JSON.parse(result!)).toEqual({
        disposition: 'auto_post',
        sourceAccountId: 'new-source',
        categoryAccountId: 'new-category',
        journalDescription: 'Olive food',
      });
    });

    it('demotes auto_post to review when an account is missing', () => {
      const result = sanitizeRuleActionsForImport(
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

      expect(JSON.parse(result!)).toEqual({
        disposition: 'review',
        sourceAccountId: 'new-source',
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

  describe('rewriteRuleActionsAccountIds', () => {
    it('rewrites only provided fields that already exist in the blob', () => {
      const result = rewriteRuleActionsAccountIds(
        JSON.stringify({
          disposition: 'auto_post',
          sourceAccountId: 'old-source',
          categoryAccountId: 'old-category',
        }),
        { sourceAccountId: 'merged' as AccountId },
      );

      expect(JSON.parse(result!)).toEqual({
        disposition: 'auto_post',
        sourceAccountId: 'merged',
        categoryAccountId: 'old-category',
      });
    });
  });

  describe('accountIdsFromRuleActionsJson', () => {
    it('extracts both account ids', () => {
      expect(
        accountIdsFromRuleActionsJson(
          JSON.stringify({ sourceAccountId: 'a', categoryAccountId: 'b' }),
        ),
      ).toEqual(['a', 'b']);
    });
  });
});
