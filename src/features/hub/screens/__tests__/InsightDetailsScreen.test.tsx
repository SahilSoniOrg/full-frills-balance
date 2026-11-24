import { render } from '@testing-library/react-native';
import InsightDetailsScreen from '../InsightDetailsScreen';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import {
  useInsightDetailsViewModel,
  type InsightDetailsViewModel,
} from '../../hooks/useInsightDetailsViewModel';
import { InsightDetailsView } from '../../components/InsightDetailsView';
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

it('makes header back exit selection, then restores navigation', () => {
  const exitSelectionMode = jest.fn();
  const useViewModel = jest.mocked(useInsightDetailsViewModel);
  const viewModel: InsightDetailsViewModel = {
    isSelectionModeActive: true,
    selectionChrome: { exitSelectionMode, selectAll: jest.fn(), clearItems: jest.fn() },
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
  expect(chrome?.selectionMode).toBe(true);
  expect(chrome?.kind).toBe('nav');
  if (chrome?.kind !== 'nav') throw new Error('Expected navigation chrome');
  chrome.onBack();
  expect(exitSelectionMode).toHaveBeenCalledTimes(1);
  expect(AppNavigation.back).not.toHaveBeenCalled();

  useViewModel.mockReturnValue({
    ...viewModel,
    isSelectionModeActive: false,
  });
  view.rerender(<InsightDetailsScreen />);
  chrome = jest.mocked(InsightDetailsView).mock.lastCall?.[0].chrome;
  expect(chrome?.selectionMode).toBe(false);
  if (chrome?.kind !== 'nav') throw new Error('Expected navigation chrome');
  chrome.onBack();
  expect(AppNavigation.back).toHaveBeenCalledTimes(1);
});
