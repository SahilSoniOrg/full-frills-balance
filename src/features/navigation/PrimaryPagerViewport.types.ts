import type { SharedValue } from 'react-native-reanimated';

export type PrimaryPagerPage = {
  name: string;
  render: () => React.ReactNode;
};

export type PrimaryPagerViewportProps = {
  pages: readonly PrimaryPagerPage[];
  committedIndex: number;
  mountedIndices: ReadonlySet<number>;
  reduceMotion: boolean;
  scrollEnabled: boolean;
  pageProgress: SharedValue<number>;
  onPageSelected: (index: number) => void;
  onTransitioningChange: (transitioning: boolean) => void;
};
