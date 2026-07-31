import { IconName } from '@/src/components/core/AppIcon';
import { AppConfig } from '@/src/constants';
import { ColorKey, Theme } from '@/src/constants/design-tokens';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import { useAccount } from '@/src/features/accounts';
import { usePlannedPaymentDetails } from '@/src/features/planned-payments/hooks/usePlannedPaymentDetails';
import { buildPlannedPaymentDetailsActions } from '@/src/features/planned-payments/hooks/plannedPaymentDetailsActions';
import { formatPlannedPaymentInterval } from '@/src/features/planned-payments/hooks/plannedPaymentDetailsPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { EnrichedJournal, JournalDisplayType } from '@/src/types/domain';
import { getAccountTypeColorKey } from '@/src/utils/accountCategory';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

export interface PlannedPaymentDetailsViewModel {
  theme: Theme;
  isLoading: boolean;
  isMissing: boolean;
  onBack: () => void;

  title?: string;
  amountText?: string;
  nameText?: string;
  statusLabel?: string;
  statusVariant?: 'success' | 'default';
  typeLabel?: string;
  typeColorKey?: ColorKey;
  iconName?: IconName;
  displayType?: JournalDisplayType;

  intervalLabel?: string;
  nextOccurrenceText?: string;
  isAutoPost?: boolean;

  fromAccount?: Account | null;
  toAccount?: Account | null;
  fromAccountColorKey?: string;
  toAccountColorKey?: string;

  history?: EnrichedJournal[];

  rawAmount?: number;
  rawName?: string;

  headerActions?: {
    onEdit: () => void;
    onDelete: () => void;
  };
  onPost?: () => void;
  onSkip?: () => void;
  onToggleStatus?: () => void;
}

export function usePlannedPaymentDetailsViewModel(id: string): PlannedPaymentDetailsViewModel {
  const { theme } = useTheme();
  const { workplaceId } = useWorkplace();
  const params = useLocalSearchParams();

  // Initial Data Injection: Extract preview data from params
  const pDesc = params.pDesc as string;
  const pAmount = params.pAmount as string;
  const pCurrency = params.pCurrency as string;
  const pDate = params.pDate as string;

  const {
    item,
    history,
    isLoading,
    handleEdit,
    handleDelete,
    handleToggleStatus,
    handlePostNow,
    handleSkip,
  } = usePlannedPaymentDetails(id, workplaceId);

  const { account: fromAccount } = useAccount(item?.fromAccountId || null, workplaceId);
  const { account: toAccount } = useAccount(item?.toAccountId || null, workplaceId);

  const isMissing = !isLoading && !item;

  // Build a preview-based skeleton if DB record is still loading
  const isLoadingVisible = isLoading && !pDesc;

  return useMemo(() => {
    if (!item) {
      // Show preview skeleton while loading
      if (pDesc && isLoading) {
        return {
          theme,
          isLoading: isLoadingVisible,
          isMissing: false,
          onBack: () => AppNavigation.back(),
          title: AppConfig.strings.plannedPayments.details.screenTitle,
          amountText: pAmount ? CurrencyFormatter.format(parseFloat(pAmount), pCurrency) : '...',
          nameText: pDesc,
          statusLabel: '',
          typeLabel: '',
          typeColorKey: 'primary',
          iconName: 'document',
          nextOccurrenceText: pDate ? new Date(parseInt(pDate)).toLocaleDateString() : '...',
          isAutoPost: false,
          fromAccount: null,
          toAccount: null,
          fromAccountColorKey: 'textSecondary',
          toAccountColorKey: 'primary',
          history: [],
          rawAmount: pAmount ? parseFloat(pAmount) : 0,
          rawName: pDesc,
          headerActions: { onEdit: handleEdit, onDelete: () => {} },
          onPost: () => {},
          onSkip: () => {},
          onToggleStatus: handleToggleStatus,
        };
      }
      return {
        theme,
        isLoading,
        isMissing: true,
        onBack: () => AppNavigation.back(),
      };
    }

    const isIncome = item.amount > 0 && fromAccount?.accountType === 'INCOME';
    const isTransfer =
      !!item.toAccountId &&
      toAccount?.accountType !== 'EXPENSE' &&
      toAccount?.accountType !== 'INCOME';
    const displayType = isTransfer
      ? JournalDisplayType.TRANSFER
      : isIncome
        ? JournalDisplayType.INCOME
        : JournalDisplayType.EXPENSE;

    const presentation = journalPresenter.getPresentation(displayType);
    const typeColorKey = presentation.colorKey as ColorKey;
    const typeLabel = presentation.label;

    const intervalLabel = formatPlannedPaymentInterval(item);

    const { headerActions, onPost, onSkip } = buildPlannedPaymentDetailsActions(item, {
      handleEdit,
      handleDelete,
      handlePostNow,
      handleSkip,
    });

    const onToggleStatus = handleToggleStatus;

    return {
      theme,
      isLoading,
      isMissing,
      onBack: () => AppNavigation.back(),

      // Core Details
      title: AppConfig.strings.plannedPayments.details.screenTitle,
      amountText: CurrencyFormatter.format(item.amount, item.currencyCode),
      nameText: item.name,
      statusLabel: item.status,
      statusVariant: item.status === 'ACTIVE' ? 'success' : 'default',
      typeLabel,
      typeColorKey,
      iconName:
        displayType === JournalDisplayType.INCOME
          ? 'arrowUp'
          : displayType === JournalDisplayType.EXPENSE
            ? 'arrowDown'
            : 'swapHorizontal',
      displayType,

      // Recurrence Details
      intervalLabel,
      nextOccurrenceText: new Date(item.nextOccurrence).toLocaleDateString(),
      isAutoPost: item.isAutoPost,

      // Account Flow
      fromAccount,
      toAccount,
      fromAccountColorKey: fromAccount
        ? getAccountTypeColorKey(fromAccount.accountType)
        : 'textSecondary',
      toAccountColorKey: toAccount ? getAccountTypeColorKey(toAccount.accountType) : typeColorKey,

      // History
      history,

      rawAmount: item.amount,
      rawName: item.name,

      // Actions
      headerActions,
      onPost,
      onSkip,
      onToggleStatus,
    };
  }, [
    item,
    history,
    isLoading,
    theme,
    fromAccount,
    toAccount,
    handleEdit,
    handleDelete,
    handleToggleStatus,
    handlePostNow,
    handleSkip,
    isMissing,
    pDesc,
    pAmount,
    pCurrency,
    pDate,
    isLoadingVisible,
  ]);
}
