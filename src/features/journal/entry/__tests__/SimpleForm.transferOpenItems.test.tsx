import { fireEvent, render, screen, waitFor } from '@/src/testing/render';
import { peopleReadService } from '@/src/services/people';
import { AccountType } from '@/src/types/enums';
import { asAccountId, asJournalId, asOpenItemId, asPersonId, asWorkplaceId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { of } from 'rxjs';
import type { useSimpleJournalEditor } from '../hooks/useSimpleJournalEditor';
import { SimpleForm } from '../components/SimpleForm';

jest.mock('@/src/components/account-selection/SimpleFormAccountSections', () => ({
  SimpleFormAccountSections: () => null,
}));

describe('SimpleForm transfer open items', () => {
  it('shows person open items and quick-fills the transfer amount', async () => {
    const personAccountId = asAccountId('person-account');
    const sourceAccountId = asAccountId('source-account');
    const personId = asPersonId('person-1');
    const account = (id: typeof personAccountId, name: string): AccountFields =>
      ({
        id,
        name,
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        isArchived: false,
      }) as AccountFields;
    const setAmount = jest.fn();
    const observeOpenItems = jest.spyOn(peopleReadService, 'observeOpenItems').mockReturnValue(
      of([
        {
          item: {
            id: asOpenItemId('open-item-1'),
            personId,
            originatingJournalId: asJournalId('origin-1'),
            direction: 'receivable',
            journalDate: 1,
            createdAt: 1,
            accountId: personAccountId,
            originalAmount: 80,
            currencyCode: 'USD',
          },
          remainder: 40,
        },
      ]),
    );
    const editor = {
      type: 'transfer',
      amount: '0',
      displayCurrency: 'USD',
      sourceId: personAccountId,
      destinationId: sourceAccountId,
      allAccounts: [account(sourceAccountId, 'Cash'), account(personAccountId, 'Person')],
      accountSections: [],
      fxPair: { isCrossCurrency: false },
      setType: jest.fn(),
      setAmount,
      setManualBaseRate: jest.fn(),
      setConvertedAmount: jest.fn(),
      resetToApiRate: jest.fn(),
      swapAccounts: jest.fn(),
    } as unknown as ReturnType<typeof useSimpleJournalEditor>;
    render(
      <SimpleForm
        editor={editor}
        accentColor="#000"
        meta={{
          description: '',
          setDescription: jest.fn(),
          date: '2026-01-01',
          setDate: jest.fn(),
          time: '12:00',
          setTime: jest.fn(),
        }}
        peopleGroups={[{ personId, personName: 'Alex', accountIds: [personAccountId] }]}
        workplaceId={asWorkplaceId('workplace-1')}
        workplaceCurrency="USD"
      />,
    );
    const chip = await waitFor(() => screen.getByText(/Full balance/));
    fireEvent.press(chip);
    expect(setAmount).toHaveBeenCalledWith('40.00');
    observeOpenItems.mockRestore();
  });

  it('quick-fills a cross-currency destination payable from its native open balance', async () => {
    const sourceAccountId = asAccountId('cash-usd');
    const payableAccountId = asAccountId('person-payable-cad');
    const personId = asPersonId('person-payable');
    const account = (
      id: typeof sourceAccountId,
      name: string,
      currencyCode: string,
      type: AccountType,
    ): AccountFields =>
      ({ id, name, accountType: type, currencyCode, isArchived: false }) as AccountFields;
    const setAmount = jest.fn();
    const onPlanChange = jest.fn();
    const setRepaymentDestinationAmount = jest.fn(() => true);
    const observeOpenItems = jest.spyOn(peopleReadService, 'observeOpenItems').mockReturnValue(
      of([
        {
          item: {
            id: asOpenItemId('cad-item'),
            personId,
            originatingJournalId: asJournalId('cad-origin'),
            direction: 'payable',
            journalDate: 1,
            createdAt: 1,
            accountId: payableAccountId,
            originalAmount: 60,
            currencyCode: 'CAD',
          },
          remainder: 40,
        },
      ]),
    );
    const editor = {
      type: 'transfer',
      amount: '0',
      displayCurrency: 'USD',
      sourceId: sourceAccountId,
      destinationId: payableAccountId,
      allAccounts: [
        account(sourceAccountId, 'Cash', 'USD', AccountType.ASSET),
        account(payableAccountId, 'Alex payable', 'CAD', AccountType.LIABILITY),
      ],
      accountSections: [],
      isCrossCurrency: true,
      fxPair: { isCrossCurrency: true, pairRate: 1.6, convertedAmount: 0 },
      setType: jest.fn(),
      setAmount,
      setManualBaseRate: jest.fn(),
      setConvertedAmount: jest.fn(),
      setRepaymentDestinationAmount,
      resetToApiRate: jest.fn(),
      swapAccounts: jest.fn(),
    } as unknown as ReturnType<typeof useSimpleJournalEditor>;
    const props = {
      editor,
      accentColor: '#000',
      meta: {
        description: '',
        setDescription: jest.fn(),
        date: '2026-01-01',
        setDate: jest.fn(),
        time: '12:00',
        setTime: jest.fn(),
      },
      peopleGroups: [{ personId, personName: 'Alex', accountIds: [payableAccountId] }],
      workplaceId: asWorkplaceId('workplace-1'),
      workplaceCurrency: 'USD',
      onTransferOpenItemPlanChange: onPlanChange,
    };
    const { rerender } = render(<SimpleForm {...props} />);
    fireEvent.press(await waitFor(() => screen.getByText(/Full balance/)));
    expect(setRepaymentDestinationAmount).toHaveBeenCalledWith(40);

    const updatedEditor = {
      ...editor,
      fxPair: { isCrossCurrency: true, pairRate: 1.6, convertedAmount: 40 },
    } as unknown as ReturnType<typeof useSimpleJournalEditor>;
    rerender(<SimpleForm {...props} editor={updatedEditor} />);
    await waitFor(() =>
      expect(onPlanChange).toHaveBeenLastCalledWith({
        personId,
        targetAccountId: payableAccountId,
        allocationMode: 'fifo',
        allocations: [{ openItemId: asOpenItemId('cad-item'), amount: 40 }],
      }),
    );
    observeOpenItems.mockRestore();
  });
});
