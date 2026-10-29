import { CommitmentsPage } from '@/src/features/commitments';
import { normalizeLegacyPrimaryRoute } from '@/src/navigation/primaryPages';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLayoutEffect } from 'react';

export default function CommitmentsRoute() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const router = useRouter();
  const shouldNormalize = params.tab !== undefined;

  useLayoutEffect(() => {
    if (!shouldNormalize) return;
    const normalized = normalizeLegacyPrimaryRoute('commitments', params);
    router.replace({
      pathname: `/(tabs)/${normalized.routeName}`,
      params: normalized.params as never,
    } as Href);
  }, [params, router, shouldNormalize]);

  return shouldNormalize ? null : <CommitmentsPage />;
}
