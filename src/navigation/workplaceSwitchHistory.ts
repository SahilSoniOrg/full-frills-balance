import {
  CommonActions,
  type NavigationAction,
  type NavigationState,
} from 'expo-router/react-navigation';
import { isWorkplaceRecordRoute, workplaceSwitchFallback } from '@/src/navigation/routeManifest';
import { PRIMARY_PAGE_ROUTE_NAMES } from '@/src/navigation/primaryPages';

const PRIMARY_TAB_ROUTE_NAMES = new Set<string>(PRIMARY_PAGE_ROUTE_NAMES);

/** Pure stack rewrite for a committed workplace switch. */
export function rewriteStackForWorkplaceSwitch(state: NavigationState): NavigationState | null {
  const visible = state.routes.slice(0, state.index + 1);
  const current = visible[visible.length - 1];
  const destination = current ? workplaceSwitchFallback(current.name) : undefined;
  const destinationName = destination?.resolveName?.(current?.params) ?? destination?.name;
  const kept = visible.filter(route => !isWorkplaceRecordRoute(route.name));
  if (!destination && kept.length === visible.length) return null;

  const routes: (NavigationState['routes'][number] | { name: string; state?: object })[] = [
    ...kept,
  ];
  const toTab = !!destinationName && PRIMARY_TAB_ROUTE_NAMES.has(destinationName);
  if (toTab && destination) {
    const existingTabs = visible.findLast(route => route.name === '(tabs)');
    const tabParams = destination.params?.(current?.params);
    const tabRoutes =
      existingTabs && 'state' in existingTabs && existingTabs.state?.routes
        ? existingTabs.state.routes.map(route =>
            route.name === destinationName && tabParams
              ? { ...route, params: { ...route.params, ...tabParams } }
              : route,
          )
        : PRIMARY_PAGE_ROUTE_NAMES.map(routeName => ({
            name: routeName,
            ...(routeName === destinationName && tabParams ? { params: tabParams } : {}),
          }));
    const tabIndex = Math.max(
      0,
      tabRoutes.findIndex(route => route.name === destinationName),
    );
    const tabsRoute = {
      ...(existingTabs ?? { name: '(tabs)' }),
      name: '(tabs)',
      state: {
        ...(existingTabs && 'state' in existingTabs ? existingTabs.state : {}),
        index: tabIndex,
        routes: tabRoutes,
      },
    };
    routes.splice(0, routes.length, ...routes.filter(route => route.name !== '(tabs)'), tabsRoute);
  } else if (destinationName && routes[routes.length - 1]?.name !== destinationName) {
    routes.push({ name: destinationName });
  }
  if (!routes.length) routes.push({ name: '(tabs)' });

  return {
    ...state,
    routes: routes as NavigationState['routes'],
    index: routes.length - 1,
  };
}

export function dispatchWorkplaceSwitchHistory(navigation: {
  getState: () => NavigationState | undefined;
  dispatch: (action: NavigationAction) => void;
}): void {
  const state = navigation.getState();
  if (!state) return;
  const next = rewriteStackForWorkplaceSwitch(state);
  if (!next) return;
  navigation.dispatch({
    ...CommonActions.reset(next),
    target: state.key,
  });
}
