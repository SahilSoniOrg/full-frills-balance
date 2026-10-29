import { createStandardRouterNavigator, TabRouter } from 'expo-router';
import {
  appendMissingPlaceholderTabDescriptors,
  appendMissingPlaceholderTabRoutes,
} from 'expo-router/build/standard-navigation/appendMissingPlaceholderTabRoutes';
import { createPrimaryPagerContent } from './PrimaryPagerNavigator.shared';
import { PrimaryPagerViewport } from './PrimaryPagerViewport.web';

export const PrimaryPager = createStandardRouterNavigator(
  createPrimaryPagerContent(PrimaryPagerViewport),
  TabRouter,
  {
    activityDefaultThreshold: 1,
    processDescriptors: appendMissingPlaceholderTabDescriptors,
    processState: appendMissingPlaceholderTabRoutes,
  },
);
