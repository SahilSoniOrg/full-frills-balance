import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { AppText } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { loadEmailPreview } from '@/src/services/email/emailPreview';

export function EmailPreviewModal({
  messageId,
  sourceId,
  onClose,
}: {
  messageId: string;
  sourceId: string;
  onClose: () => void;
}) {
  const { workplaceId } = useWorkplace();
  const requestKey = `${workplaceId}:${messageId}:${sourceId}`;
  const [loadKey, setLoadKey] = useState(requestKey);
  const [html, setHtml] = useState<string>();
  const [failed, setFailed] = useState(false);
  if (loadKey !== requestKey) {
    setLoadKey(requestKey);
    setHtml(undefined);
    setFailed(false);
  }
  useEffect(() => {
    const controller = new AbortController();
    void loadEmailPreview(workplaceId, messageId, sourceId, controller.signal).then(
      result => {
        if (!controller.signal.aborted) setHtml(result);
      },
      () => {
        if (!controller.signal.aborted) setFailed(true);
      },
    );
    return () => controller.abort();
  }, [workplaceId, messageId, sourceId]);
  return (
    <ModalSurface
      visible
      title="Original email"
      onClose={onClose}
      scrollable={false}
      maxHeightPercent={90}
    >
      <View style={{ flex: 1, minHeight: 300 }}>
        {failed ? (
          <AppText>
            Could not load this email. Check your connection and Gmail sign-in, or open it in Gmail.
          </AppText>
        ) : html ? (
          <WebView
            source={{ html }}
            originWhitelist={['about:blank']}
            javaScriptEnabled={false}
            domStorageEnabled={false}
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            mixedContentMode="never"
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
          />
        ) : (
          <ActivityIndicator />
        )}
      </View>
    </ModalSurface>
  );
}
