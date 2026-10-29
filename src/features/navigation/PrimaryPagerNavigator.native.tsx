import { createStandardRouterNavigator, TabRouter } from 'expo-router';
import {
  appendMissingPlaceholderTabDescriptors,
  appendMissingPlaceholderTabRoutes,
} from 'expo-router/build/standard-navigation/appendMissingPlaceholderTabRoutes';
import { createPrimaryPagerContent } from './PrimaryPagerNavigator.shared';
import { PrimaryPagerViewport } from './PrimaryPagerViewport.native';

// TabRouter activity pruning keeps only the focused route in `state.routes`.
// NativeTabs/Expo Tabs expand placeholders so every declared screen stays
// addressable — required here so the pager mounts all pages and tabs resolve.
export const PrimaryPager = createStandardRouterNavigator(
  createPrimaryPagerContent(PrimaryPagerViewport),
  TabRouter,
  {
    activityDefaultThreshold: 1,
    processDescriptors: appendMissingPlaceholderTabDescriptors,
    processState: appendMissingPlaceholderTabRoutes,
  },
);
