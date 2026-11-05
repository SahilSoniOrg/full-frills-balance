import { fireEvent, render } from '@/src/utils/test-utils';
import { TransactionInboxItemCardView } from '../TransactionInboxItemCardView';
import { JournalId } from '@/src/types/ids';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import { InboxProcessingStatus } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import * as privacy from '@/src/contexts/PrivacyScope';

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
    // Duplicate is the primary action; the rest live behind More.
    expect(getByTestId('inbox-compare-duplicate-sms-card-1')).toBeTruthy();
    fireEvent.press(getByTestId('inbox-more-sms-card-1'));
    expect(getByText('Import / Review')).toBeTruthy();
    expect(getByText('Dismiss')).toBeTruthy();
    expect(getByText('View Raw')).toBeTruthy();
    expect(getByTestId('inbox-split-btn-sms-card-1')).toBeTruthy();
    expect(getByTestId('inbox-create-rule-btn-sms-card-1')).toBeTruthy();
    expect(getByTestId('inbox-edit-reparse-btn-sms-card-1')).toBeTruthy();
  });

  it('triggers onSplitImport when Split button is pressed', () => {
    const { getByTestId } = render(<TransactionInboxItemCardView {...defaultProps} />);

    fireEvent.press(getByTestId('inbox-more-sms-card-1'));
    fireEvent.press(getByTestId('inbox-split-btn-sms-card-1'));
    expect(defaultProps.onSplitImport).toHaveBeenCalledWith(mockItem);
  });

  it('triggers onCreateRule when Create Rule button is pressed', () => {
    const { getByTestId } = render(<TransactionInboxItemCardView {...defaultProps} />);

    fireEvent.press(getByTestId('inbox-more-sms-card-1'));
    fireEvent.press(getByTestId('inbox-create-rule-btn-sms-card-1'));
    expect(defaultProps.onCreateRule).toHaveBeenCalledWith(mockItem);
  });

  it('triggers onEditReparse when Edit & Re-parse button is pressed', () => {
    const { getByTestId } = render(<TransactionInboxItemCardView {...defaultProps} />);

    fireEvent.press(getByTestId('inbox-more-sms-card-1'));
    fireEvent.press(getByTestId('inbox-edit-reparse-btn-sms-card-1'));
    expect(defaultProps.onEditReparse).toHaveBeenCalledWith(mockItem);
  });

  it('triggers onCompareDuplicate when Compare duplicate is pressed', () => {
    const { getByTestId } = render(<TransactionInboxItemCardView {...defaultProps} />);

    fireEvent.press(getByTestId('inbox-compare-duplicate-sms-card-1'));
    expect(defaultProps.onCompareDuplicate).toHaveBeenCalledWith(mockItem);
  });

  it('replaces the raw parse-failure status with a recoverable explanation', () => {
    const { getByText, getByTestId, queryByText } = render(
      <TransactionInboxItemCardView
        {...defaultProps}
        item={{
          ...mockItem,
          processingStatus: InboxProcessingStatus.PARSE_FAILED,
          duplicateCandidate: undefined,
        }}
      />,
    );

    expect(getByText("Couldn't read transaction details")).toBeTruthy();
    expect(getByText('Edit & Re-parse')).toBeTruthy();
    expect(getByTestId('inbox-edit-reparse-btn-sms-card-1')).toBeTruthy();
    expect(queryByText('PARSE FAILED')).toBeNull();
  });

  it('shows the hold reason and recognized account names outside effective privacy mode', () => {
    const { getByText } = render(
      <TransactionInboxItemCardView
        {...defaultProps}
        item={{
          ...mockItem,
          recognition: {
            status: 'recognized',
            accountIds: ['account-1' as AccountId],
            matcherIds: ['matcher-1'],
            hold: 'contradictory',
          },
          recognizedAccountNames: ['Savings'],
        }}
      />,
    );

    expect(getByText('Account recognition conflicts')).toBeTruthy();
    expect(getByText('Recognized: Savings')).toBeTruthy();
  });

  it('hides matcher details in effective privacy mode', () => {
    jest.spyOn(privacy, 'useEffectivePrivacyMode').mockReturnValue(true);
    const { queryByText } = render(
      <TransactionInboxItemCardView
        {...defaultProps}
        item={{
          ...mockItem,
          recognition: {
            status: 'indeterminate',
            accountIds: [],
            matcherIds: ['matcher-1'],
            hold: 'indeterminate',
          },
          recognizedAccountNames: ['Savings'],
        }}
      />,
    );

    expect(queryByText("Couldn't check the account")).toBeNull();
    expect(queryByText('Recognized: Savings')).toBeNull();
  });
});
