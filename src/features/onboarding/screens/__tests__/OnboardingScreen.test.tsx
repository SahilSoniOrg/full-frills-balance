import { render } from '@testing-library/react-native';
import OnboardingScreen from '../OnboardingScreen';

jest.mock('../../hooks/useOnboardingFlow', () => ({
  useOnboardingFlow: () => ({}),
}));

jest.mock('../../components/OnboardingView', () => ({
  OnboardingView: () => {
    const { usePrivacyScope } = jest.requireActual<typeof import('@/src/contexts/PrivacyScope')>(
      '@/src/contexts/PrivacyScope',
    );
    usePrivacyScope();
    return null;
  },
}));

describe('OnboardingScreen', () => {
  it('provides a privacy scope to onboarding content', () => {
    expect(() => render(<OnboardingScreen />)).not.toThrow();
  });
});
