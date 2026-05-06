import { AppIcon, AppText } from '@/src/components/core';
import { Shape, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalSuggestionsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}

export function JournalSuggestions({ suggestions, onSelect }: JournalSuggestionsProps) {
  const { theme } = useTheme();

  if (suggestions.length === 0) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: '#000',
        },
      ]}
    >
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.scrollView}>
        {suggestions.map((suggestion, index) => (
          <TouchableOpacity
            key={`${suggestion}-${index}`}
            style={[
              styles.suggestionItem,
              {
                borderBottomColor: theme.border,
                borderBottomWidth: index === suggestions.length - 1 ? 0 : StyleSheet.hairlineWidth,
              },
            ]}
            onPress={() => onSelect(suggestion)}
          >
            <View style={styles.itemContent}>
              <AppIcon name="clock" size={12} color={theme.textTertiary} />
              <AppText variant="body" color="text" weight="medium" style={styles.suggestionText}>
                {suggestion}
              </AppText>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    maxHeight: 240,
    borderRadius: Shape.radius.md,
    borderWidth: 1,
    zIndex: 1000,
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    marginTop: Spacing.xs,
    overflow: 'hidden',
  },
  scrollView: {
    width: '100%',
  },
  suggestionItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  suggestionText: {
    flex: 1,
  },
});
