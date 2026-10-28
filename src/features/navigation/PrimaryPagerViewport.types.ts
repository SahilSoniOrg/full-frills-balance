import type { SharedValue } from 'react-native-reanimated';
import type { GestureType } from 'react-native-gesture-handler';

export type PrimaryPagerPage = {
  key: string;
  name: string;
  render: () => React.ReactNode;
};

export type PrimaryPagerViewportProps = {
  pages: readonly PrimaryPagerPage[];
  committedIndex: number;
  mountedIndices: ReadonlySet<number>;
  isTransitioning: boolean;
  scrollEnabled: boolean;
  pageProgress: SharedValue<number>;
  onPageSelected: (index: number) => void;
  onTransitioningChange: (transitioning: boolean) => void;
  onPageGestureReady: (gesture: GestureType | null) => void;
};
