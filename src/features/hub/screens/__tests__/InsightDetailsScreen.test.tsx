import { render } from '@testing-library/react-native';
import InsightDetailsScreen from '../InsightDetailsScreen';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import {
  useInsightDetailsViewModel,
  type InsightDetailsViewModel,
} from '../../hooks/useInsightDetailsViewModel';
import { InsightDetailsView } from '../../components/InsightDetailsView';
import { getSelectionState } from '@/src/hooks/selectionState';
import { Icon } from '@/src/types/domainIcons';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));
jest.mock('@/src/contexts/PrivacyScope', () => ({
  withPrivacyScope: (component: unknown) => component,
}));
jest.mock('@/src/navigation/AppNavigation', () => ({
  AppNavigation: { back: jest.fn() },
}));
jest.mock('../../hooks/useInsightDetailsViewModel', () => ({
  useInsightDetailsViewModel: jest.fn(),
}));
jest.mock('../../components/InsightDetailsView', () => ({
  InsightDetailsView: jest.fn(() => null),
}));

it('publishes selection chrome only while selection is active', () => {
  const exitSelectionMode = jest.fn();
  const useViewModel = jest.mocked(useInsightDetailsViewModel);
  const viewModel: InsightDetailsViewModel = {
    isSelectionModeActive: true,
    selectionChrome: {
      state: getSelectionState(new Set(), []),
      itemTypeLabel: 'transaction',
      exitSelectionMode,
      selectAll: jest.fn(),
      clearItems: jest.fn(),
    },
    selectedIds: new Set(),
    onLongPressItem: jest.fn(),
    items: [],
    isLoading: false,
    emptyTitle: '',
    emptySubtitle: '',
    header: {
      severityColor: '',
      severityLabel: '',
      iconName: Icon.TrendingUp,
      message: '',
      amount: null,
      currencyCode: '',
      description: null,
      suggestion: '',
      impactLabel: '',
      whyThisAppeared: '',
      recommendedActionLabel: '',
      basisText: '',
      transactionsTitle: '',
    },
  };
  useViewModel.mockReturnValue(viewModel);

  const view = render(<InsightDetailsScreen />);
  let chrome = jest.mocked(InsightDetailsView).mock.lastCall?.[0].chrome;
  expect(chrome?.selection?.exitSelectionMode).toBe(exitSelectionMode);
  expect(chrome?.kind).toBe('nav');
  if (chrome?.kind !== 'nav') throw new Error('Expected navigation chrome');
  expect(chrome.onBack).toBe(AppNavigation.back);

  useViewModel.mockReturnValue({
    ...viewModel,
    isSelectionModeActive: false,
    selectionChrome: undefined,
  });
  view.rerender(<InsightDetailsScreen />);
  chrome = jest.mocked(InsightDetailsView).mock.lastCall?.[0].chrome;
  expect(chrome?.selection).toBeUndefined();
  if (chrome?.kind !== 'nav') throw new Error('Expected navigation chrome');
  chrome.onBack();
  expect(AppNavigation.back).toHaveBeenCalledTimes(1);
});
