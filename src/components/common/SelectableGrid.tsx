import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { Layout, Opacity, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useCallback } from 'react';
import { FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { Box, Inline, Stack } from '@/src/design-system';

export interface SelectableItem {
  id?: string;
  name: string;
  icon?: IconName;
  symbol?: string;
  color?: string;
  subtitle?: string;
}

export interface SelectableGridProps {
  title: string;
  subtitle: string;
  items: SelectableItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onContinue: () => void;
  onBack: () => void;
  isCompleting: boolean;
  maxSelection?: number;
  renderIcon?: (item: SelectableItem, isSelected: boolean) => React.ReactNode;
  renderSubtitle?: (item: SelectableItem, isSelected: boolean) => React.ReactNode;
  accentColor?: string;
  footerActionLabel?: string;
  bottomContent?: React.ReactNode;
}

export const SelectableGrid: React.FC<SelectableGridProps> = ({
  title,
  subtitle,
  items,
  selectedIds,
  onToggle,
  onContinue,
  onBack,
  isCompleting,
  maxSelection,
  renderIcon,
  renderSubtitle,
  accentColor,
  footerActionLabel = 'Continue',
  bottomContent,
}) => {
  const { theme } = useTheme();
  const effectiveAccentColor = accentColor || theme.primary;

  const handleToggle = useCallback(
    (id: string) => {
      if (maxSelection && selectedIds.length >= maxSelection && !selectedIds.includes(id)) {
        return;
      }
      onToggle(id);
    },
    [maxSelection, onToggle, selectedIds],
  );

  const renderItem = useCallback(
    ({ item }: { item: SelectableItem }) => {
      const itemId = item.id ?? item.name;
      const isSelected = selectedIds.includes(itemId);
      const isAtMax =
        maxSelection !== undefined && selectedIds.length >= maxSelection && !isSelected;

      return (
        <TouchableOpacity
          onPress={() => handleToggle(itemId)}
          disabled={isAtMax}
          activeOpacity={Opacity.heavy}
          accessibilityLabel={`${item.name}, ${isSelected ? 'selected' : 'not selected'}`}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected, disabled: isAtMax }}
        >
          <Box
            borderRadius="r3"
            style={{
              borderWidth: 1.5,
              backgroundColor: isSelected
                ? withOpacity(effectiveAccentColor, Opacity.selection)
                : theme.surface,
              borderColor: isSelected ? effectiveAccentColor : theme.border,
              minHeight: Layout.touchTarget.minHeight,
            }}
            padding="md"
            justifyContent="space-between"
          >
            <Inline justify="space-between" align="flex-start" marginBottom="md">
              <Box
                width={Size.xl}
                height={Size.xl}
                borderRadius="full"
                justifyContent="center"
                alignItems="center"
                background={
                  (isSelected
                    ? withOpacity(effectiveAccentColor, Opacity.soft)
                    : theme.background) as any
                }
              >
                {renderIcon ? (
                  renderIcon(item, isSelected)
                ) : item.icon ? (
                  <AppIcon
                    name={item.icon}
                    size={Size.iconMd}
                    color={isSelected ? effectiveAccentColor : theme.text}
                  />
                ) : item.symbol ? (
                  <AppText
                    variant="heading"
                    style={{ color: isSelected ? effectiveAccentColor : theme.text }}
                  >
                    {item.symbol}
                  </AppText>
                ) : null}
              </Box>
              {isSelected && (
                <AppIcon name="checkCircle" size={Size.iconMd} color={effectiveAccentColor} />
              )}
            </Inline>

            <Stack space="xs">
              <AppText
                variant="subheading"
                style={{ color: isSelected ? effectiveAccentColor : theme.text }}
                numberOfLines={1}
              >
                {item.name}
              </AppText>
              {renderSubtitle ? (
                renderSubtitle(item, isSelected)
              ) : item.subtitle ? (
                <AppText
                  variant="caption"
                  color="secondary"
                  style={{
                    color: isSelected
                      ? withOpacity(effectiveAccentColor, Opacity.strong)
                      : theme.textSecondary,
                  }}
                >
                  {item.subtitle}
                </AppText>
              ) : null}
            </Stack>
          </Box>
        </TouchableOpacity>
      );
    },
    [
      selectedIds,
      theme,
      effectiveAccentColor,
      maxSelection,
      renderIcon,
      renderSubtitle,
      handleToggle,
    ],
  );

  return (
    <Box flex={1}>
      <FlatList
        data={items}
        renderItem={({ item }: { item: SelectableItem }) => (
          <Box style={{ width: '46%', margin: '2%' }}>{renderItem({ item })}</Box>
        )}
        keyExtractor={(item: SelectableItem) => item.id ?? item.name}
        numColumns={2}
        columnWrapperStyle={styles.grid}
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <Stack align="center" paddingTop="lg" paddingBottom="md" space="xs">
            <AppText variant="title" style={{ textAlign: 'center' }}>
              {title}
            </AppText>
            <AppText
              variant="body"
              color="secondary"
              style={{ textAlign: 'center', paddingHorizontal: Spacing.xl }}
            >
              {subtitle}
            </AppText>
          </Stack>
        }
      />

      {bottomContent && <Box paddingHorizontal="lg">{bottomContent}</Box>}

      <Stack paddingBottom={0} space="sm">
        <AppButton
          variant="primary"
          size="lg"
          onPress={onContinue}
          disabled={isCompleting}
          style={{ width: '100%' }}
        >
          {footerActionLabel}
        </AppButton>
        <AppButton variant="ghost" size="md" onPress={onBack} disabled={isCompleting}>
          Back
        </AppButton>
      </Stack>
    </Box>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Spacing.xs,
  },
});
