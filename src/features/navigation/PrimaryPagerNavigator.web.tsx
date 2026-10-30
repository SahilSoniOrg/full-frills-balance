import { createStandardRouterNavigator, TabRouter } from 'expo-router';
import {
  appendMissingPlaceholderTabDescriptors,
  appendMissingPlaceholderTabRoutes,
} from 'expo-router/build/standard-navigation/appendMissingPlaceholderTabRoutes';
import { createPrimaryPagerContent } from './PrimaryPagerNavigator.shared';
import { PrimaryStaticViewport } from './PrimaryStaticViewport';
import { HomeV2Viewport } from './HomeV2Viewport.web';

export const PrimaryPager = createStandardRouterNavigator(
  createPrimaryPagerContent(PrimaryStaticViewport, HomeV2Viewport),
  TabRouter,
  {
    activityDefaultThreshold: 1,
    processDescriptors: appendMissingPlaceholderTabDescriptors,
    processState: appendMissingPlaceholderTabRoutes,
  },
);
