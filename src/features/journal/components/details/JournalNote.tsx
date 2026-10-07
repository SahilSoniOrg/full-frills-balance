import { AppText, AppIcon, Icon } from '@/src/components/core';
import { Size } from '@/src/constants';
import { Inline } from '@/src/design-system';

export function JournalNote({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <Inline space="sm" background="surface" borderRadius="lg" padding="md" alignItems="flex-start">
      <AppIcon name={Icon.Edit} size={Size.iconXs} color="textSecondary" />
      <AppText variant="body" style={{ flex: 1 }}>
        {note}
      </AppText>
    </Inline>
  );
}
