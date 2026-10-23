import { Redirect, useLocalSearchParams } from 'expo-router';

export default function WidgetLaunchRoute() {
  const { source, workplaceId } = useLocalSearchParams<{
    source?: string;
    workplaceId?: string;
  }>();

  if (source === 'widget' && typeof workplaceId === 'string') {
    return (
      <Redirect
        href={{
          pathname: '/(tabs)',
          params: { source, workplaceId },
        }}
      />
    );
  }

  return <Redirect href="/(tabs)" />;
}
