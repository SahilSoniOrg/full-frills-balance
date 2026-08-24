import { fireEvent, render } from '@/src/utils/test-utils';
import { DuplicateConflictResolutionModal } from '../DuplicateConflictResolutionModal';
import { JournalId } from '@/src/types/ids';
import { TransactionInboxItem } from '@/src/types/domainJournal';

describe('DuplicateConflictResolutionModal', () => {
  const mockItem: TransactionInboxItem = {
    id: 'rec-1',
    channel: 'sms',
    deviceSourceId: 'sms-1',
    senderAddress: 'HDFCBK',
    rawBody: 'Rs 1500.00 spent on Card 1234 at STARBUCKS on 15-Aug-2026. Ref: REF9988.',
    inputDate: 1786800000000,
    parseStatus: 'parsed',
    processingStatus: 'duplicate_flagged',
    parsedAmount: 1500,
    parsedCurrencyCode: 'INR',
    parsedMerchant: 'STARBUCKS',
    referenceNumber: 'REF9988',
    direction: 'debit',
    duplicateCandidate: {
      journalId: 'j-existing-1' as JournalId,
      journalDate: 1786800000000,
      description: 'Coffee at Starbucks',
      totalAmount: 1500,
      currencyCode: 'INR',
      score: 0.95,
      reasons: ['Close in time', 'Matching reference number (REF9988)'],
    },
  };

  const defaultProps = {
    visible: true,
    item: mockItem,
    defaultCurrencyCode: 'INR',
    onClose: jest.fn(),
    onMarkDuplicateAndDismiss: jest.fn(),
    onMerge: jest.fn(),
    onPostAnyway: jest.fn(),
    onViewJournal: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders side-by-side comparison details correctly', () => {
    const { getByText, getByTestId } = render(
      <DuplicateConflictResolutionModal {...defaultProps} />,
    );

    expect(getByText('Duplicate Conflict Detected')).toBeTruthy();
    expect(getByText('95% Match')).toBeTruthy();
    expect(getByText('Close in time')).toBeTruthy();
    expect(getByText('STARBUCKS')).toBeTruthy();
    expect(getByText('Coffee at Starbucks')).toBeTruthy();
    expect(getByTestId('duplicate-modal-merge-btn')).toBeTruthy();
    expect(getByTestId('duplicate-modal-dismiss-btn')).toBeTruthy();
    expect(getByTestId('duplicate-modal-post-anyway-btn')).toBeTruthy();
    expect(getByTestId('duplicate-modal-view-journal-btn')).toBeTruthy();
  });

  it('triggers onMerge and closes when Merge button is pressed', () => {
    const { getByTestId } = render(<DuplicateConflictResolutionModal {...defaultProps} />);

    fireEvent.press(getByTestId('duplicate-modal-merge-btn'));
    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onMerge).toHaveBeenCalledWith(mockItem);
  });

  it('triggers onMarkDuplicateAndDismiss when Dismiss button is pressed', () => {
    const { getByTestId } = render(<DuplicateConflictResolutionModal {...defaultProps} />);

    fireEvent.press(getByTestId('duplicate-modal-dismiss-btn'));
    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onMarkDuplicateAndDismiss).toHaveBeenCalledWith(mockItem);
  });

  it('triggers onPostAnyway when Post as Separate Entry button is pressed', () => {
    const { getByTestId } = render(<DuplicateConflictResolutionModal {...defaultProps} />);

    fireEvent.press(getByTestId('duplicate-modal-post-anyway-btn'));
    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onPostAnyway).toHaveBeenCalledWith(mockItem);
  });

  it('triggers onViewJournal when View Existing Journal button is pressed', () => {
    const { getByTestId } = render(<DuplicateConflictResolutionModal {...defaultProps} />);

    fireEvent.press(getByTestId('duplicate-modal-view-journal-btn'));
    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onViewJournal).toHaveBeenCalledWith(mockItem);
  });

  it('renders nothing when item has no duplicate candidate', () => {
    const { queryByText } = render(
      <DuplicateConflictResolutionModal
        {...defaultProps}
        item={{ ...mockItem, duplicateCandidate: undefined }}
      />,
    );
    expect(queryByText('Duplicate Conflict Detected')).toBeNull();
  });
});
