import { createStandardRouterNavigator, TabRouter } from 'expo-router';
import {
  appendMissingPlaceholderTabDescriptors,
  appendMissingPlaceholderTabRoutes,
} from 'expo-router/build/standard-navigation/appendMissingPlaceholderTabRoutes';
import { createPrimaryPagerContent } from './PrimaryPagerNavigator.shared';
import { HomeV2Viewport } from './HomeV2Viewport.web';

export const PrimaryPager = createStandardRouterNavigator(
  createPrimaryPagerContent(HomeV2Viewport),
  TabRouter,
  {
    activityDefaultThreshold: 1,
    processDescriptors: appendMissingPlaceholderTabDescriptors,
    processState: appendMissingPlaceholderTabRoutes,
    createProps: ({ state, dispatch }) => ({
      preloadPage: (routeName: string) => {
        const route = state.routes.find(item => item.name === routeName);
        // appendMissingPlaceholderTabRoutes uses the route name as a placeholder
        // key. Real routes already own their params and must not be re-preloaded.
        if (!route || route.key !== route.name) return;
        dispatch({ type: 'PRELOAD', payload: { name: routeName } });
      },
    }),
  },
);
