import { act, fireEvent, render, waitFor } from '@/src/utils/test-utils';
import { EditReparseSmsModal } from '../EditReparseSmsModal';
import { TransactionInboxItem } from '@/src/types/domain';
import { smsService } from '@/src/services/sms-service';

jest.mock('@/src/services/sms-service', () => ({
  smsService: {
    parseTransactionMessageAsync: jest.fn(),
  },
}));

describe('EditReparseSmsModal', () => {
  const mockItem: TransactionInboxItem = {
    id: 'rec-1',
    channel: 'sms',
    deviceSourceId: 'sms-1',
    senderAddress: 'VK-HDFCBK',
    rawBody: 'Rs 450.00 spent at Uber on 10-Aug.',
    inputDate: 1786800000000,
    parseStatus: 'parsed',
    processingStatus: 'pending',
    parsedAmount: 450,
    parsedCurrencyCode: 'INR',
    parsedMerchant: 'Uber',
    direction: 'debit',
  };

  const defaultProps = {
    visible: true,
    item: mockItem,
    defaultCurrencyCode: 'INR',
    onClose: jest.fn(),
    onImportParsed: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders modal with initial sender and raw text', () => {
    const { getByTestId, getByText } = render(<EditReparseSmsModal {...defaultProps} />);

    expect(getByText('Edit & Re-Parse Message')).toBeTruthy();
    expect(getByTestId('edit-reparse-sender-input').props.value).toBe('VK-HDFCBK');
    expect(getByTestId('edit-reparse-body-input').props.value).toBe(
      'Rs 450.00 spent at Uber on 10-Aug.',
    );
  });

  it('re-parses edited text when Re-Parse button is clicked', async () => {
    (smsService.parseTransactionMessageAsync as jest.Mock).mockResolvedValue({
      id: 'sms-1',
      amount: 900,
      currency: 'INR',
      merchant: 'Swiggy',
      type: 'debit',
      date: 1786800000000,
      confidence: 0.9,
      parseReason: 'Keyword match',
    });

    const { getByTestId, getByText } = render(<EditReparseSmsModal {...defaultProps} />);

    fireEvent.changeText(
      getByTestId('edit-reparse-body-input'),
      'Rs 900.00 debited for Swiggy order.',
    );
    await act(async () => {
      fireEvent.press(getByTestId('edit-reparse-trigger-btn'));
    });

    await waitFor(() => {
      expect(smsService.parseTransactionMessageAsync).toHaveBeenCalledWith({
        id: 'sms-1',
        address: 'VK-HDFCBK',
        body: 'Rs 900.00 debited for Swiggy order.',
        date: 1786800000000,
      });
      expect(getByText('Swiggy')).toBeTruthy();
    });
  });

  it('applies updated values and calls onImportParsed', async () => {
    const { getByTestId } = render(<EditReparseSmsModal {...defaultProps} />);

    await act(async () => {
      fireEvent.press(getByTestId('edit-reparse-import-btn'));
    });

    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onImportParsed).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'rec-1',
        parsedAmount: 450,
        parsedMerchant: 'Uber',
      }),
    );
  });

  it('automatically parses dirty text on import if Re-Parse was not tapped', async () => {
    (smsService.parseTransactionMessageAsync as jest.Mock).mockResolvedValue({
      id: 'sms-1',
      amount: 1200,
      currencyCode: 'INR',
      merchant: 'Amazon',
      type: 'debit',
      date: 1786800000000,
      confidence: 0.95,
      parseReason: 'Merchant detected',
    });

    const { getByTestId } = render(<EditReparseSmsModal {...defaultProps} />);

    fireEvent.changeText(getByTestId('edit-reparse-body-input'), 'Paid Rs 1200 at Amazon.');

    await act(async () => {
      fireEvent.press(getByTestId('edit-reparse-import-btn'));
    });

    expect(smsService.parseTransactionMessageAsync).toHaveBeenCalledWith({
      id: 'sms-1',
      address: 'VK-HDFCBK',
      body: 'Paid Rs 1200 at Amazon.',
      date: 1786800000000,
    });

    expect(defaultProps.onImportParsed).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'rec-1',
        parsedAmount: 1200,
        parsedMerchant: 'Amazon',
        rawBody: 'Paid Rs 1200 at Amazon.',
      }),
    );
  });
});
