import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { HubView } from '@/src/features/hub/components/HubView';
import type { HubViewModel } from '@/src/features/hub/hooks/useHubViewModel';
import { render, screen } from '@/src/testing/render';

const chrome: ScreenNavChrome = {
  kind: 'nav',
  screenTitle: 'Review',
  onBack: jest.fn(),
};

function baseProps(
  overrides: Partial<HubViewModel> = {},
): HubViewModel & { chrome: ScreenNavChrome } {
  return {
    activeTab: 'active',
    setActiveTab: jest.fn(),
    tabOptions: [
      { id: 'active', label: 'Active', badge: 0 },
      { id: 'dismissed', label: 'Dismissed', badge: 0 },
    ],
    activeInsights: [],
    dismissedInsights: [],
    isInsightsLoading: false,
    unreadSmsCount: 0,
    currencyCode: 'USD',
    strings: AppConfig.strings.dashboard.hub,
    dismissInsight: jest.fn(),
    restoreInsight: jest.fn(),
    onOpenInbox: jest.fn(),
    onOpenInsight: jest.fn(),
    onCreateEmergencyAccount: jest.fn(),
    chrome,
    ...overrides,
  };
}

describe('HubView', () => {
  it('shows loading instead of empty while active insights have not emitted', () => {
    render(<HubView {...baseProps({ isInsightsLoading: true })} />);

    expect(screen.getByLabelText(AppConfig.strings.common.loading)).toBeTruthy();
    expect(screen.queryByText(AppConfig.strings.dashboard.hub.emptyState)).toBeNull();
  });

  it('shows empty only after active insights have emitted with zero items', () => {
    render(<HubView {...baseProps({ isInsightsLoading: false })} />);

    expect(screen.getByText(AppConfig.strings.dashboard.hub.emptyState)).toBeTruthy();
    expect(screen.queryByLabelText(AppConfig.strings.common.loading)).toBeNull();
  });

  it('shows loading instead of empty while dismissed insights have not emitted', () => {
    render(
      <HubView
        {...baseProps({
          activeTab: 'dismissed',
          isInsightsLoading: true,
        })}
      />,
    );

    expect(screen.getByLabelText(AppConfig.strings.common.loading)).toBeTruthy();
    expect(screen.queryByText(AppConfig.strings.dashboard.hub.noDismissed)).toBeNull();
  });
});
