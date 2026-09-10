import { render } from '@/src/utils/test-utils';
import type { AccountId } from '@/src/types/ids';
import type { SmsRuleSuggestion } from '@/src/services/sms/SmsRuleEngine';
import { SmsRulesView } from '../SmsRulesView';

const makeSuggestion = (bodyMatch: string): SmsRuleSuggestion => ({
  senderMatch: 'TX-FEDSCP-S',
  bodyMatch,
  sourceAccountId: 'source-account' as AccountId,
  categoryAccountId: 'category-account' as AccountId,
  sourceAccountName: 'Scapia Rupay',
  categoryAccountName: 'Food & Drinks',
  sampleCount: 2,
  sampleMerchants: [bodyMatch],
});

describe('SmsRulesView', () => {
  it('keeps suggestions with the same sender and category distinct', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { getByText } = render(
        <SmsRulesView
          rules={[]}
          suggestions={[makeSuggestion('Abdul Nassar'), makeSuggestion('Nikhil Jadon')]}
          accountMap={new Map()}
          onOpenRule={jest.fn()}
          onOpenSuggestion={jest.fn()}
        />,
      );

      expect(getByText('Contains: Abdul Nassar')).toBeTruthy();
      expect(getByText('Contains: Nikhil Jadon')).toBeTruthy();

      const duplicateKeyWarning = consoleError.mock.calls.some(args =>
        args.some(
          arg =>
            typeof arg === 'string' && arg.includes('Encountered two children with the same key'),
        ),
      );

      expect(duplicateKeyWarning).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });
});
