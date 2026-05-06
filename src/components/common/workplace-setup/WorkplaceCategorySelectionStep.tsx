import { CategoryCreationBar } from '@/src/components/common/CategoryCreationBar';
import { SelectableGrid, SelectableItem } from '@/src/components/common/SelectableGrid';
import { AppIcon, AppText, IconName } from '@/src/components/core';
import { AppConfig, Size } from '@/src/constants';
import { DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useMemo } from 'react';

interface WorkplaceCategorySelectionStepProps {
  selectedCategories: string[];
  customCategories: { name: string; type: 'INCOME' | 'EXPENSE'; icon: IconName }[];
  onToggleCategory: (name: string) => void;
  onAddCustomCategory: (name: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => void;
  onContinue: () => void;
  onBack: () => void;
  isCompleting: boolean;
}

export function WorkplaceCategorySelectionStep({
  selectedCategories,
  customCategories,
  onToggleCategory,
  onAddCustomCategory,
  onContinue,
  onBack,
  isCompleting,
}: WorkplaceCategorySelectionStepProps) {
  const { theme } = useTheme();
  const incomeLabel = AppConfig.strings.onboarding.categories.typeLabels.income;
  const expenseLabel = AppConfig.strings.onboarding.categories.typeLabels.expense;

  const categoryItems: SelectableItem[] = useMemo(
    () => [
      ...DEFAULT_CATEGORIES.map(category => ({
        ...category,
        id: category.name, // Use name as ID to match state
        subtitle: category.type === 'INCOME' ? incomeLabel : expenseLabel,
      })),
      ...customCategories.map(category => ({
        id: category.name,
        name: category.name,
        icon: category.icon,
        subtitle: category.type === 'INCOME' ? incomeLabel : expenseLabel,
      })),
    ],
    [customCategories, incomeLabel, expenseLabel],
  );

  const renderCategoryIcon = (item: SelectableItem, isSelected: boolean) => {
    const categoryType = item.subtitle === incomeLabel ? 'INCOME' : 'EXPENSE';
    const behaviorColor = categoryType === 'INCOME' ? theme.success : theme.error;
    return (
      <AppIcon
        name={item.icon as IconName}
        size={Size.iconSm}
        color={isSelected ? behaviorColor : theme.textSecondary}
      />
    );
  };

  const renderCategorySubtitle = (item: SelectableItem, isSelected: boolean) => {
    const categoryType = item.subtitle === incomeLabel ? 'INCOME' : 'EXPENSE';
    const behaviorColor = categoryType === 'INCOME' ? theme.success : theme.error;
    return (
      <AppText
        variant="caption"
        style={{ color: isSelected ? behaviorColor : theme.textSecondary }}
      >
        {item.subtitle}
      </AppText>
    );
  };

  const handleToggle = (id: string) => {
    const item = categoryItems.find(candidate => candidate.id === id);
    if (item) {
      onToggleCategory(item.name);
    }
  };

  return (
    <SelectableGrid
      title={AppConfig.strings.onboarding.categories.title}
      subtitle={AppConfig.strings.onboarding.categories.subtitle}
      items={categoryItems}
      selectedIds={selectedCategories}
      onToggle={handleToggle}
      onContinue={onContinue}
      onBack={onBack}
      isCompleting={isCompleting}
      disableAnimation={true}
      bottomContent={
        <CategoryCreationBar
          placeholder={AppConfig.strings.onboarding.categories.placeholder}
          onAdd={onAddCustomCategory}
          defaultIcon="tag"
          showTypeToggle={true}
          typeLabels={AppConfig.strings.onboarding.categories.typeLabels}
        />
      }
      renderIcon={renderCategoryIcon}
      renderSubtitle={renderCategorySubtitle}
    />
  );
}
