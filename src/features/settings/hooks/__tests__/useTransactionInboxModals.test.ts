import { act, renderHook } from '@testing-library/react-native';
import { useTransactionInboxModals } from '../useTransactionInboxModals';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import { smsService } from '@/src/services/sms-service';
import { AppNavigation } from '@/src/utils/navigation';

jest.mock('@/src/services/sms-service', () => ({
  smsService: {
    finalizeManualImport: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/src/services/analytics', () => ({
  analytics: {
    trackFeatureUsage: jest.fn(),
  },
}));

jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: {
    toJournalDetails: jest.fn(),
  },
}));

jest.mock('@/src/utils/alerts', () => ({
  showErrorAlert: jest.fn(),
  toast: {
    success: jest.fn(),
  },
}));

describe('useTransactionInboxModals', () => {
  const mockWorkplaceId = 'wp-1' as WorkplaceId;
  const mockHandleImport = jest.fn();

  const mockItem: TransactionInboxItem = {
    id: 'inbox-1',
    channel: 'sms',
    deviceSourceId: 'sms-src-1',
    senderAddress: 'HDFCBK',
    rawBody: 'Paid Rs 500 at Cafe',
    inputDate: 1786800000000,
    parseStatus: 'parsed',
    processingStatus: 'duplicate_flagged',
    parsedAmount: 500,
    parsedMerchant: 'Cafe',
    direction: 'debit',
    duplicateCandidate: {
      journalId: 'j-dup-1' as JournalId,
      journalDate: 1786800000000,
      description: 'Cafe Coffee',
      totalAmount: 500,
      currencyCode: 'INR',
      score: 0.9,
      reasons: ['Close in time'],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('manages duplicate modal open and close state', () => {
    const { result } = renderHook(() =>
      useTransactionInboxModals({
        workplaceId: mockWorkplaceId,
        items: [mockItem],
        handleImport: mockHandleImport,
      }),
    );

    expect(result.current.selectedDuplicateItem).toBeNull();

    act(() => {
      result.current.handleOpenDuplicateModal(mockItem);
    });
    expect(result.current.selectedDuplicateItem).toEqual(mockItem);

    act(() => {
      result.current.handleCloseDuplicateModal();
    });
    expect(result.current.selectedDuplicateItem).toBeNull();
  });

  it('manages edit re-parse modal open and close state', () => {
    const { result } = renderHook(() =>
      useTransactionInboxModals({
        workplaceId: mockWorkplaceId,
        items: [mockItem],
        handleImport: mockHandleImport,
      }),
    );

    expect(result.current.selectedEditReparseItem).toBeNull();

    act(() => {
      result.current.handleOpenEditReparseModal(mockItem);
    });
    expect(result.current.selectedEditReparseItem).toEqual(mockItem);

    act(() => {
      result.current.handleCloseEditReparseModal();
    });
    expect(result.current.selectedEditReparseItem).toBeNull();
  });

  it('resolves the live item from items after list updates', () => {
    let items = [mockItem];
    const { result, rerender } = renderHook(() =>
      useTransactionInboxModals({
        workplaceId: mockWorkplaceId,
        items,
        handleImport: mockHandleImport,
      }),
    );

    act(() => {
      result.current.handleOpenDuplicateModal(mockItem);
    });
    expect(result.current.selectedDuplicateItem?.parsedMerchant).toBe('Cafe');

    items = [{ ...mockItem, parsedMerchant: 'Cafe Updated' }];
    rerender({});
    expect(result.current.selectedDuplicateItem?.parsedMerchant).toBe('Cafe Updated');
  });

  it('clears the selected modal item when it leaves the live list', () => {
    let items: TransactionInboxItem[] = [mockItem];
    const { result, rerender } = renderHook(() =>
      useTransactionInboxModals({
        workplaceId: mockWorkplaceId,
        items,
        handleImport: mockHandleImport,
      }),
    );

    act(() => {
      result.current.handleOpenDuplicateModal(mockItem);
    });
    expect(result.current.selectedDuplicateItem).toEqual(mockItem);

    items = [];
    rerender({});
    expect(result.current.selectedDuplicateItem).toBeNull();
  });

  it('invalidates modal selection on workplace swap', () => {
    const { result, rerender } = renderHook(
      ({ workplaceId }) =>
        useTransactionInboxModals({
          workplaceId,
          items: [mockItem],
          handleImport: mockHandleImport,
        }),
      { initialProps: { workplaceId: mockWorkplaceId } },
    );

    act(() => {
      result.current.handleOpenDuplicateModal(mockItem);
    });
    expect(result.current.selectedDuplicateItem).toEqual(mockItem);

    rerender({ workplaceId: 'wp-2' as WorkplaceId });
    expect(result.current.selectedDuplicateItem).toBeNull();
  });

  it('merges duplicate item and marks SMS processed', async () => {
    const { result } = renderHook(() =>
      useTransactionInboxModals({
        workplaceId: mockWorkplaceId,
        items: [mockItem],
        handleImport: mockHandleImport,
      }),
    );

    await act(async () => {
      await result.current.handleMergeDuplicate(mockItem);
    });

    expect(smsService.finalizeManualImport).toHaveBeenCalledWith('wp-1', 'inbox-1', 'j-dup-1');
  });

  it('triggers split import via handleImport with mode split', () => {
    const { result } = renderHook(() =>
      useTransactionInboxModals({
        workplaceId: mockWorkplaceId,
        items: [mockItem],
        handleImport: mockHandleImport,
      }),
    );

    act(() => {
      result.current.handleSplitImport(mockItem);
    });

    expect(mockHandleImport).toHaveBeenCalledWith(mockItem, { mode: 'split' });
  });

  it('navigates to journal details when viewing duplicate journal candidate', () => {
    const { result } = renderHook(() =>
      useTransactionInboxModals({
        workplaceId: mockWorkplaceId,
        items: [mockItem],
        handleImport: mockHandleImport,
      }),
    );

    act(() => {
      result.current.handleViewJournalFromDuplicate(mockItem);
    });

    expect(AppNavigation.toJournalDetails).toHaveBeenCalledWith('j-dup-1');
  });
});
