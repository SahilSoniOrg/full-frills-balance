import { act, renderHook } from '@testing-library/react-native';
import { useWorkplaceSettingsViewModel } from '../useWorkplaceSettingsViewModel';
import { workplaceService } from '@/src/services/WorkplaceService';
import { confirm } from '@/src/utils/alerts';
import { Icon } from '@/src/types/domainIcons';

const mockWorkplace = { id: 'home', name: 'Home', icon: 'briefcase', defaultCurrencyCode: 'USD' };
const mockDelete = jest.fn().mockResolvedValue({ status: 'committed', warnings: [] });
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({
    workplaceId: 'home',
    defaultCurrencyCode: 'USD',
    activeWorkplace: mockWorkplace,
    deleteWorkplace: mockDelete,
  }),
}));
jest.mock('@/src/hooks/use-currencies', () => ({ useCurrencies: () => ({ currencies: [] }) }));
jest.mock('@/src/hooks/useStsPreferences', () => ({
  useStsPreferences: () => ({ safeToSpendDays: 30, setSafeToSpendDays: jest.fn() }),
}));
jest.mock('@/src/services/analytics', () => ({ analytics: { trackFeatureUsage: jest.fn() } }));
jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: { getAllWorkplaces: jest.fn(), updateWorkplace: jest.fn() },
}));
jest.mock('@/src/utils/alerts', () => ({
  confirm: { show: jest.fn() },
  toast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() },
}));

describe('workplace settings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens the named confirmation and only deletes after confirmation', async () => {
    // The service returns model objects; the hook only reads id and name here.
    jest
      .mocked(workplaceService.getAllWorkplaces)
      .mockImplementation(
        async () =>
          [{ ...mockWorkplace }] as Awaited<ReturnType<typeof workplaceService.getAllWorkplaces>>,
      );
    const { result } = renderHook(useWorkplaceSettingsViewModel);
    await act(async () => {
      await result.current.deleteWorkplace();
    });
    expect(confirm.show).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredConfirmationValue: 'Home',
        destructive: true,
      }),
    );
    expect(mockDelete).not.toHaveBeenCalled();
    const options = jest.mocked(confirm.show).mock.calls[0][0];
    await act(async () => {
      await options.onConfirm?.();
    });
    expect(mockDelete).toHaveBeenCalledWith('home');
  });

  it('reports a failed rename so the editor can retain the entered changes', async () => {
    jest.mocked(workplaceService.updateWorkplace).mockRejectedValueOnce(new Error('write failed'));
    const { result } = renderHook(useWorkplaceSettingsViewModel);
    await expect(result.current.updateWorkplaceDetails('Renamed', Icon.Bank)).resolves.toBe(false);
  });
});
