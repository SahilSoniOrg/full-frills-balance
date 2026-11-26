import { fireEvent, render, screen, waitFor } from '@/src/testing/render';
import { peopleReadService } from '@/src/services/people';
import { AccountType } from '@/src/types/enums';
import { asAccountId, asOpenItemId, asPersonId, asWorkplaceId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
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
    const getPersonDetail = jest.spyOn(peopleReadService, 'getPersonDetail').mockResolvedValue({
      openItems: [
        {
          item: { id: asOpenItemId('open-item-1'), originalAmount: 80, currencyCode: 'USD' },
          remainder: 40,
        },
      ],
    } as Awaited<ReturnType<typeof peopleReadService.getPersonDetail>>);
    const editor = {
      type: 'transfer',
      amount: '0',
      displayCurrency: 'USD',
      sourceId: sourceAccountId,
      destinationId: personAccountId,
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
    await waitFor(() => expect(getPersonDetail).toHaveBeenCalled());
    const chip = await waitFor(() => screen.getByText(/Full balance/));
    fireEvent.press(chip);
    expect(setAmount).toHaveBeenCalledWith('40.00');
    getPersonDetail.mockRestore();
  });
});
