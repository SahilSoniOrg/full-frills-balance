import { AppText } from '@/src/components/core/AppText';
import { Spacing } from '@/src/constants';
import { Inset, Separator, Stack } from '@/src/design-system';
import React from 'react';
import { ScreenSectionHeader } from './ScreenSectionHeader';

type SectionProps<T> =
  | {
      title: string;
      items: T[];
      renderItem: (item: T, index: number) => React.ReactNode;
      keyExtractor: (item: T, index: number) => string;
      emptyText: string;
      separator?: boolean | React.ReactNode;
      children?: never;
    }
  | {
      title: string;
      items?: never;
      renderItem?: never;
      keyExtractor?: never;
      emptyText?: never;
      separator?: never;
      children: React.ReactNode;
    };

export function Section<T>({
  title,
  items,
  renderItem,
  keyExtractor,
  emptyText,
  separator = true,
  children,
}: SectionProps<T>) {
  const isListMode = Array.isArray(items) && renderItem && keyExtractor;

  return (
    <Stack space="sm">
      <ScreenSectionHeader title={title} style={{ paddingHorizontal: Spacing.xs }} />
      <Stack space="none">
        {Array.isArray(items) && items.length === 0 && (
          <Inset horizontal="xs" vertical="sm">
            <AppText variant="body" color="secondary">
              {emptyText}
            </AppText>
          </Inset>
        )}

        {isListMode &&
          items.map((item, index) => (
            <React.Fragment key={keyExtractor(item, index)}>
              {renderItem(item, index)}
              {separator !== false &&
                index < items.length - 1 &&
                (typeof separator === 'boolean' ? <Separator /> : separator)}
            </React.Fragment>
          ))}

        {children}
      </Stack>
    </Stack>
  );
}
