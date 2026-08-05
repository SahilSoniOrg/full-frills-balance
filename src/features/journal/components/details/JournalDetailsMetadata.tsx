import { Section } from '@/src/components/common/Section';
import { AppIcon, AppText, ListRow } from '@/src/components/core';
import { Typography } from '@/src/constants';
import { Box, Inline } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useMemo } from 'react';

interface JournalDetailsMetadataProps {
  formattedDate: string;
  notesText?: string | null;
  onHistoryPress: () => void;
}

interface MetaItem {
  key: string;
  title: string;
  trailing: React.ReactNode;
  onPress?: () => void;
}

export const JournalDetailsMetadata = React.memo(
  ({ formattedDate, notesText, onHistoryPress }: JournalDetailsMetadataProps) => {
    const { theme } = useTheme();

    const items = useMemo(() => {
      const list: MetaItem[] = [
        {
          key: 'date',
          title: 'Date',
          trailing: (
            <AppText variant="body" color="secondary">
              {formattedDate}
            </AppText>
          ),
        },
      ];

      if (notesText) {
        list.push({
          key: 'notes',
          title: 'Notes',
          trailing: (
            <Box style={{ flex: 1, alignItems: 'flex-end', maxWidth: '65%' }}>
              <AppText
                variant="body"
                color="secondary"
                numberOfLines={3}
                style={{ textAlign: 'right' }}
              >
                {notesText}
              </AppText>
            </Box>
          ),
        });
      }

      list.push({
        key: 'history',
        title: 'History',
        trailing: (
          <Inline space="xs" alignItems="center">
            <AppText variant="body" color="primary">
              View Edit History
            </AppText>
            <AppIcon name="chevronRight" size={Typography.sizes.sm} color={theme.primary} />
          </Inline>
        ),
        onPress: onHistoryPress,
      });

      return list;
    }, [formattedDate, notesText, onHistoryPress, theme.primary]);

    return (
      <Section
        title="Metadata & Timeline"
        items={items}
        emptyText="No metadata recorded."
        keyExtractor={item => item.key}
        renderItem={item => (
          <ListRow
            title={item.title}
            trailing={item.trailing}
            onPress={item.onPress}
            padding="md"
          />
        )}
      />
    );
  },
);

JournalDetailsMetadata.displayName = 'JournalDetailsMetadata';
