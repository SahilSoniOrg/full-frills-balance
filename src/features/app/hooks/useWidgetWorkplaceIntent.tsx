import { AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { workplaceService } from '@/src/services/WorkplaceService';
import { preferences } from '@/src/services/preferences';
import { alert, confirm } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import type { WorkplaceId } from '@/src/types/ids';
import type { LaunchCoordinatorState } from '../LaunchCoordinator.types';
import type { WorkplaceTransition } from './useWorkplaceTransitions';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import * as Linking from 'expo-linking';

export function useWidgetWorkplaceIntent(
  state: LaunchCoordinatorState,
  transitionToWorkplace: WorkplaceTransition,
  isPrivacyPolicyAcknowledged: boolean,
): { isWidgetWorkplaceSwitchPending: boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams();
  const routeWidgetWorkplaceId =
    globalParams.source === 'widget' && typeof globalParams.workplaceId === 'string'
      ? (globalParams.workplaceId as WorkplaceId)
      : undefined;
  const [pendingWidgetWorkplaceId, setPendingWidgetWorkplaceId] = useState<WorkplaceId | null>(
    null,
  );
  const handledWidgetPromptRef = useRef<{
    widgetWorkplaceId: WorkplaceId;
    currentWorkplaceId: WorkplaceId | null;
  } | null>(null);

  useEffect(() => {
    const captureWidgetLaunch = (url: string | null, isInitialUrl = false) => {
      if (!url) return;
      const params = Linking.parse(url).queryParams;
      if (params?.source === 'widget' && typeof params.workplaceId === 'string') {
        if (!isInitialUrl) handledWidgetPromptRef.current = null;
        setPendingWidgetWorkplaceId(params.workplaceId as WorkplaceId);
      }
    };

    void Linking.getInitialURL()
      .then(url => captureWidgetLaunch(url, true))
      .catch(error =>
        logger.warn('[LaunchCoordinator] Could not read initial widget link', { error }),
      );
    const subscription = Linking.addEventListener('url', ({ url }) => captureWidgetLaunch(url));
    return () => subscription.remove();
  }, []);

  const widgetWorkplaceId = routeWidgetWorkplaceId ?? pendingWidgetWorkplaceId ?? undefined;
  const widgetPromptContextRef = useRef({
    workplaceId: widgetWorkplaceId,
    isPrivacyPolicyAcknowledged,
  });
  useEffect(() => {
    widgetPromptContextRef.current = {
      workplaceId: widgetWorkplaceId,
      isPrivacyPolicyAcknowledged,
    };
  }, [widgetWorkplaceId, isPrivacyPolicyAcknowledged]);

  const isWidgetWorkplaceSwitchPending =
    widgetWorkplaceId !== undefined &&
    (state.kind === 'picker' || (state.kind === 'open' && state.workplaceId !== widgetWorkplaceId));

  useEffect(() => {
    if (!widgetWorkplaceId) return;
    if (state.kind !== 'open' && state.kind !== 'picker') return;
    if (!isPrivacyPolicyAcknowledged || pathname === '/privacy-notice') return;
    if (state.kind === 'open' && state.workplaceId === widgetWorkplaceId) return;
    const previousId = state.kind === 'open' ? state.workplaceId : undefined;
    const handledPrompt = handledWidgetPromptRef.current;
    if (
      handledPrompt?.widgetWorkplaceId === widgetWorkplaceId &&
      handledPrompt.currentWorkplaceId === (previousId ?? null)
    )
      return;

    handledWidgetPromptRef.current = {
      widgetWorkplaceId,
      currentWorkplaceId: previousId ?? null,
    };
    const continueInCurrentWorkplace = () => {
      setPendingWidgetWorkplaceId(null);
      router.replace('/(tabs)');
    };
    const switchToWidgetWorkplace = () => {
      setPendingWidgetWorkplaceId(null);
      void transitionToWorkplace(widgetWorkplaceId, previousId, { preserveRoute: true }).then(
        () => {
          if (preferences.device.activeWorkplaceId !== widgetWorkplaceId) {
            logger.warn(
              '[LaunchCoordinator] Widget workplace is unavailable; opening active workplace',
              { workplaceId: widgetWorkplaceId },
            );
            router.replace('/(tabs)');
          }
        },
      );
    };

    if (!previousId) {
      switchToWidgetWorkplace();
      return;
    }

    void Promise.all([
      workplaceService.getWorkplace(previousId),
      workplaceService.getWorkplace(widgetWorkplaceId),
    ])
      .then(([currentWorkplace, widgetWorkplace]) => {
        const promptContext = widgetPromptContextRef.current;
        if (
          promptContext.workplaceId !== widgetWorkplaceId ||
          !promptContext.isPrivacyPolicyAcknowledged
        )
          return;
        if (!currentWorkplace) {
          setPendingWidgetWorkplaceId(null);
          logger.warn(
            '[LaunchCoordinator] Widget workplace is unavailable; opening active workplace',
            { workplaceId: widgetWorkplaceId },
          );
          router.replace('/(tabs)');
          return;
        }
        if (!widgetWorkplace) {
          const copy = AppConfig.strings.settings.widgetWorkplacePrompt;
          alert.show({
            title: copy.unavailableTitle,
            message: copy.unavailableMessage(currentWorkplace.name),
            actionText: copy.continueIn(currentWorkplace.name),
            onAction: continueInCurrentWorkplace,
            onClose: continueInCurrentWorkplace,
          });
          return;
        }
        if (preferences.device.activeWorkplaceId !== previousId) return;

        const copy = AppConfig.strings.settings.widgetWorkplacePrompt;
        confirm.show({
          title: copy.title,
          message: copy.message(widgetWorkplace.name, currentWorkplace.name),
          messageContent: (
            <AppText>
              This widget uses{' '}
              <AppText color="primary" weight="semibold">
                {widgetWorkplace.name}
              </AppText>
              . You’re in{' '}
              <AppText color="primary" weight="semibold">
                {currentWorkplace.name}
              </AppText>
              . Switch?
            </AppText>
          ),
          cancelText: copy.stay,
          confirmText: copy.switchTo,
          onCancel: continueInCurrentWorkplace,
          onConfirm: switchToWidgetWorkplace,
          onClose: continueInCurrentWorkplace,
        });
      })
      .catch(error => {
        const promptContext = widgetPromptContextRef.current;
        if (
          promptContext.workplaceId !== widgetWorkplaceId ||
          !promptContext.isPrivacyPolicyAcknowledged
        )
          return;
        logger.warn('[LaunchCoordinator] Could not resolve widget workplace names', { error });
        setPendingWidgetWorkplaceId(null);
        router.replace('/(tabs)');
      });
  }, [
    isPrivacyPolicyAcknowledged,
    pathname,
    router,
    state,
    transitionToWorkplace,
    widgetWorkplaceId,
  ]);

  return { isWidgetWorkplaceSwitchPending };
}
