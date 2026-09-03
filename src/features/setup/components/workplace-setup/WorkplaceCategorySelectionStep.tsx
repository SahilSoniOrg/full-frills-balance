import { CategoryCreationBar } from '@/src/features/setup/components/CategoryCreationBar';
import { SelectableGrid, SelectableItem } from '@/src/features/setup/components/SelectableGrid';
import { AppIcon, AppText, IconName } from '@/src/components/core';
import { AppConfig, Size } from '@/src/constants';
import { DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo, useState } from 'react';

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
  const [showValidation, setShowValidation] = useState(false);
  const incomeLabel = AppConfig.strings.onboarding.categories.typeLabels.income;
  const expenseLabel = AppConfig.strings.onboarding.categories.typeLabels.expense;

  const categoryItems = useMemo(
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

  const categorySections = useMemo(
    () => [
      {
        title: incomeLabel,
        data: categoryItems.filter(item => item.subtitle === incomeLabel),
      },
      {
        title: expenseLabel,
        data: categoryItems.filter(item => item.subtitle === expenseLabel),
      },
    ],
    [categoryItems, expenseLabel, incomeLabel],
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
      setShowValidation(false);
    }
  };

  const handleContinue = () => {
    const selectedTypes = new Set(
      categoryItems.filter(item => selectedCategories.includes(item.id)).map(item => item.subtitle),
    );
    if (!selectedTypes.has(incomeLabel) || !selectedTypes.has(expenseLabel)) {
      setShowValidation(true);
      return;
    }
    onContinue();
  };

  return (
    <SelectableGrid
      title={AppConfig.strings.onboarding.categories.title}
      subtitle={AppConfig.strings.onboarding.categories.subtitle}
      items={categoryItems}
      sections={categorySections}
      selectedIds={selectedCategories}
      onToggle={handleToggle}
      onContinue={handleContinue}
      onBack={onBack}
      isCompleting={isCompleting}
      disableAnimation={true}
      validationMessage={
        showValidation
          ? `Choose at least one ${incomeLabel.toLowerCase()} and one ${expenseLabel.toLowerCase()} category.`
          : undefined
      }
      listFooterContent={
        <CategoryCreationBar
          placeholder={AppConfig.strings.onboarding.categories.placeholder}
          onAdd={(name, type, icon) => {
            if (type === 'INCOME' || type === 'EXPENSE') {
              onAddCustomCategory(name, type, icon);
              setShowValidation(false);
            }
          }}
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
