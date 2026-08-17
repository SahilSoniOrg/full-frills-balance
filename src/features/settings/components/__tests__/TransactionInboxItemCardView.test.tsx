import { fireEvent, render } from '@/src/utils/test-utils';
import { TransactionInboxItemCardView } from '../TransactionInboxItemCardView';
import { JournalId, TransactionInboxItem } from '@/src/types/domain';

describe('TransactionInboxItemCardView', () => {
  const mockItem: TransactionInboxItem = {
    id: 'rec-1',
    channel: 'sms',
    deviceSourceId: 'sms-card-1',
    senderAddress: 'HDFCBK',
    rawBody: 'Rs 1200.00 spent at Zomato',
    inputDate: 1786800000000,
    parseStatus: 'parsed',
    processingStatus: 'pending',
    parsedAmount: 1200,
    parsedCurrencyCode: 'INR',
    parsedMerchant: 'Zomato',
    direction: 'debit',
    duplicateCandidate: {
      journalId: 'j-1' as JournalId,
      journalDate: 1786800000000,
      description: 'Zomato dinner',
      totalAmount: 1200,
      currencyCode: 'INR',
      score: 0.9,
      reasons: ['Close in time'],
    },
  };

  const defaultProps = {
    item: mockItem,
    currencyCode: 'INR',
    handleDismiss: jest.fn(),
    handleUndismiss: jest.fn(),
    handleImport: jest.fn(),
    onCompareDuplicate: jest.fn(),
    onOpenJournal: jest.fn(),
    onCreateRule: jest.fn(),
    onSplitImport: jest.fn(),
    onEditReparse: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders card with duplicate badge and action palette buttons', () => {
    const { getByText, getByTestId } = render(<TransactionInboxItemCardView {...defaultProps} />);

    expect(getByText('Zomato')).toBeTruthy();
    expect(getByText('likely duplicate')).toBeTruthy();
    expect(getByTestId('inbox-split-btn-sms-card-1')).toBeTruthy();
    expect(getByTestId('inbox-create-rule-btn-sms-card-1')).toBeTruthy();
    expect(getByTestId('inbox-edit-reparse-btn-sms-card-1')).toBeTruthy();
    expect(getByTestId('inbox-compare-duplicate-sms-card-1')).toBeTruthy();
  });

  it('triggers onSplitImport when Split button is pressed', () => {
    const { getByTestId } = render(<TransactionInboxItemCardView {...defaultProps} />);

    fireEvent.press(getByTestId('inbox-split-btn-sms-card-1'));
    expect(defaultProps.onSplitImport).toHaveBeenCalledWith(mockItem);
  });

  it('triggers onCreateRule when Create Rule button is pressed', () => {
    const { getByTestId } = render(<TransactionInboxItemCardView {...defaultProps} />);

    fireEvent.press(getByTestId('inbox-create-rule-btn-sms-card-1'));
    expect(defaultProps.onCreateRule).toHaveBeenCalledWith(mockItem);
  });

  it('triggers onEditReparse when Edit & Re-parse button is pressed', () => {
    const { getByTestId } = render(<TransactionInboxItemCardView {...defaultProps} />);

    fireEvent.press(getByTestId('inbox-edit-reparse-btn-sms-card-1'));
    expect(defaultProps.onEditReparse).toHaveBeenCalledWith(mockItem);
  });

  it('triggers onCompareDuplicate when Compare duplicate is pressed', () => {
    const { getByTestId } = render(<TransactionInboxItemCardView {...defaultProps} />);

    fireEvent.press(getByTestId('inbox-compare-duplicate-sms-card-1'));
    expect(defaultProps.onCompareDuplicate).toHaveBeenCalledWith(mockItem);
  });
});
