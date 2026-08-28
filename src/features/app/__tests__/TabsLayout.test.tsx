import { TabsLayout } from '@/src/features/app/TabsLayout';
import { Spacing } from '@/src/constants';
import { render } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

type CapturedScreenOptions = {
  tabBarLabelStyle?: StyleProp<TextStyle>;
  tabBarStyle?: StyleProp<ViewStyle>;
};

type CapturedTabsProps = {
  safeAreaInsets?: { bottom?: number };
  screenOptions: CapturedScreenOptions;
};

let mockScreenOptions: CapturedScreenOptions | undefined;
let mockSafeAreaInsets: CapturedTabsProps['safeAreaInsets'];
let mockDeviceBottomInset = 24;

jest.mock('expo-router', () => {
  const MockTabs = ({ screenOptions, safeAreaInsets }: CapturedTabsProps) => {
    mockScreenOptions = screenOptions;
    mockSafeAreaInsets = safeAreaInsets;
    return null;
  };
  const MockTabScreen = () => null;

  MockTabScreen.displayName = 'MockTabScreen';
  MockTabs.Screen = MockTabScreen;
  return { Tabs: MockTabs };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: mockDeviceBottomInset, left: 0 }),
}));

jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: {
      primary: '#00aa77',
      textSecondary: '#666666',
      surface: '#ffffff',
      border: '#dddddd',
    },
  }),
}));

describe('TabsLayout', () => {
  beforeEach(() => {
    mockDeviceBottomInset = 24;
    mockSafeAreaInsets = undefined;
    mockScreenOptions = undefined;
  });

  it('does not shift tab items down inside the navigator fixed height', () => {
    render(<TabsLayout />);

    expect(StyleSheet.flatten(mockScreenOptions?.tabBarStyle)?.paddingTop).toBeUndefined();
  });

  it('uses native tab-label typography', () => {
    render(<TabsLayout />);

    expect(mockScreenOptions?.tabBarLabelStyle).toBeUndefined();
  });

  it.each([
    ['device without a bottom inset', 0],
    ['Android gesture navigation', 24],
    ['iPhone home indicator', 34],
    ['large system navigation inset', 48],
  ])('preserves the %s and adds optical clearance', (_device, deviceInset) => {
    mockDeviceBottomInset = deviceInset;

    render(<TabsLayout />);

    expect(mockSafeAreaInsets?.bottom).toBe(deviceInset + Spacing.md);
  });
});
