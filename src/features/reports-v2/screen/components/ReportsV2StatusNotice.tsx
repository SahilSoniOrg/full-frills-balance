import { AppButton, Icon } from '@/src/components/core';
import { NoticeBanner } from '@/src/components/shared/NoticeBanner';
import { useTheme } from '@/src/hooks/use-theme';
import { ActivityIndicator } from 'react-native';

export function ReportsV2StatusNotice({
  state,
  onRetry,
}: {
  state: 'refreshing' | 'error';
  onRetry: () => void;
}) {
  const { theme } = useTheme();
  const isError = state === 'error';

  return (
    <NoticeBanner
      tone={isError ? 'error' : 'info'}
      icon={isError ? Icon.Alert : Icon.Refresh}
      title={isError ? 'Report update failed' : 'Updating report'}
      message={
        isError
          ? 'Showing the previous results. Try again.'
          : 'Your current results stay visible while we update.'
      }
      action={
        isError ? (
          <AppButton variant="ghost" size="sm" onPress={onRetry}>
            Retry
          </AppButton>
        ) : (
          <ActivityIndicator size="small" color={theme.primary} />
        )
      }
    />
  );
}
