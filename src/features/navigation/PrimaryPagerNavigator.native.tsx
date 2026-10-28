import { createStandardRouterNavigator, TabRouter } from 'expo-router';
import { createPrimaryPagerContent } from './PrimaryPagerNavigator.shared';
import { PrimaryPagerViewport } from './PrimaryPagerViewport.native';

export const PrimaryPager = createStandardRouterNavigator(
  createPrimaryPagerContent(PrimaryPagerViewport),
  TabRouter,
);
