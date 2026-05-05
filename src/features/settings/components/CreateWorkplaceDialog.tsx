import { CategoryCreationBar } from '@/src/components/common/CategoryCreationBar';
import { IconPickerModal } from '@/src/components/common/IconPickerModal';
import { SelectableGrid, SelectableItem } from '@/src/components/common/SelectableGrid';
import {
  AppButton,
  AppIcon,
  AppInput,
  AppText,
  IconName,
  isValidIconName,
} from '@/src/components/core';
import { Box, Inset, Page, Stack } from '@/src/design-system';
import { StepIndicator } from '@/src/components/common/StepIndicator';
import { AppConfig } from '@/src/constants';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { useTheme } from '@/src/hooks/use-theme';
import { triggerHaptic } from '@/src/utils/haptics';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

interface CreateWorkplaceDialogProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (
    name: string,
    icon: IconName,
    options: {
      initialAccounts?: { name: string; type: any; icon: IconName }[];
      initialCategories?: { name: string; type: any; icon: IconName }[];
      currencyCode: string;
    },
  ) => void;
  isCreating: boolean;
}

type Step = 'basic' | 'currency' | 'accounts' | 'categories';

export function CreateWorkplaceDialog({
  visible,
  onClose,
  onCreate,
  isCreating,
}: CreateWorkplaceDialogProps) {
  const { theme } = useTheme();
  const [step, setStep] = useState<Step>('basic');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<IconName>('briefcase');
  const [iconPickerVisible, setIconPickerVisible] = useState(false);

  // Selection state
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(['Cash', 'Bank']);
  const [customAccounts, setCustomAccounts] = useState<{ name: string; icon: IconName }[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    'Salary',
    'Food & Drink',
    'Groceries',
    'Bills',
  ]);
  const [customCategories, setCustomCategories] = useState<
    { name: string; type: 'INCOME' | 'EXPENSE'; icon: IconName }[]
  >([]);

  const [selectedCurrency, setSelectedCurrency] = useState<string>(AppConfig.defaultCurrency);
  const [currencySearchQuery, setCurrencySearchQuery] = useState('');
  const { currencies } = require('@/src/hooks/use-currencies').useCurrencies();

  useEffect(() => {
    if (visible) {
      setStep('basic');
      setName('');
      setIcon('briefcase');
      setSelectedCurrency(AppConfig.defaultCurrency);
      setCurrencySearchQuery('');
      setSelectedAccounts(['Cash', 'Bank']);
      setCustomAccounts([]);
      setSelectedCategories(['Salary', 'Food & Drink', 'Groceries', 'Bills']);
      setCustomCategories([]);
    }
  }, [visible]);

  const accountItems: SelectableItem[] = useMemo(
    () => [
      ...DEFAULT_ACCOUNTS.map(acc => ({ id: acc.name, name: acc.name, icon: acc.icon })),
      ...customAccounts.map(acc => ({ id: acc.name, name: acc.name, icon: acc.icon })),
    ],
    [customAccounts],
  );

  const categoryItems: SelectableItem[] = useMemo(
    () => [
      ...DEFAULT_CATEGORIES.map(cat => ({
        id: cat.name,
        name: cat.name,
        icon: cat.icon,
        subtitle: cat.type === 'INCOME' ? 'Income' : 'Expense',
      })),
      ...customCategories.map(cat => ({
        id: cat.name,
        name: cat.name,
        icon: cat.icon,
        subtitle: cat.type === 'INCOME' ? 'Income' : 'Expense',
      })),
    ],
    [customCategories],
  );

  const currencyItems: SelectableItem[] = useMemo(() => {
    const uniqueCurrencies = Array.from(new Map(currencies.map((c: any) => [c.code, c])).values());

    let mappedItems = uniqueCurrencies.map((currency: any) => ({
      id: currency.code,
      name: currency.code,
      symbol: currency.symbol,
      subtitle: currency.name,
    }));

    if (currencySearchQuery.trim()) {
      const query = currencySearchQuery.toLowerCase();
      mappedItems = mappedItems.filter(
        (i: any) =>
          i.name.toLowerCase().includes(query) ||
          (i.subtitle && i.subtitle.toLowerCase().includes(query)),
      );
    } else if (selectedCurrency) {
      return [...mappedItems].sort((a, b) => {
        if (a.id === selectedCurrency) return -1;
        if (b.id === selectedCurrency) return 1;
        return 0;
      });
    }

    return mappedItems;
  }, [currencies, currencySearchQuery, selectedCurrency]);

  const renderCategoryIcon = (item: SelectableItem, isSelected: boolean) => {
    const isIncome = item.subtitle === 'Income';
    const behaviorColor = isIncome ? theme.success : theme.error;
    return (
      <AppIcon
        name={item.icon as IconName}
        size={20}
        color={isSelected ? behaviorColor : theme.textSecondary}
      />
    );
  };

  const renderCategorySubtitle = (item: SelectableItem, isSelected: boolean) => {
    const isIncome = item.subtitle === 'Income';
    const behaviorColor = isIncome ? theme.success : theme.error;
    return (
      <AppText
        variant="caption"
        style={{ color: isSelected ? behaviorColor : theme.textSecondary }}
      >
        {item.subtitle}
      </AppText>
    );
  };

  const handleToggleAccount = (accountName: string) => {
    setSelectedAccounts(prev => {
      const isSelected = prev.includes(accountName);
      void triggerHaptic(isSelected ? 'light' : 'medium');
      return isSelected ? prev.filter(a => a !== accountName) : [...prev, accountName];
    });
  };

  const handleAddCustomAccount = (accountName: string, _type: any, icon: IconName) => {
    setSelectedAccounts(prev => (prev.includes(accountName) ? prev : [...prev, accountName]));
    setCustomAccounts(prev =>
      prev.some(a => a.name === accountName) || DEFAULT_ACCOUNTS.some(a => a.name === accountName)
        ? prev
        : [...prev, { name: accountName, icon }],
    );
    void triggerHaptic('medium');
  };

  const handleToggleCategory = (categoryName: string) => {
    setSelectedCategories(prev => {
      const isSelected = prev.includes(categoryName);
      void triggerHaptic(isSelected ? 'light' : 'medium');
      return isSelected ? prev.filter(c => c !== categoryName) : [...prev, categoryName];
    });
  };

  const handleAddCustomCategory = (
    categoryName: string,
    type: 'INCOME' | 'EXPENSE',
    icon: IconName,
  ) => {
    setSelectedCategories(prev => (prev.includes(categoryName) ? prev : [...prev, categoryName]));
    setCustomCategories(prev =>
      prev.some(c => c.name === categoryName) ||
      DEFAULT_CATEGORIES.some(c => c.name === categoryName)
        ? prev
        : [...prev, { name: categoryName, type, icon }],
    );
    void triggerHaptic('medium');
  };

  const handleNext = () => {
    void triggerHaptic('medium');
    if (step === 'basic') setStep('currency');
    else if (step === 'currency') setStep('accounts');
    else if (step === 'accounts') setStep('categories');
  };

  const handleBack = () => {
    void triggerHaptic('light');
    if (step === 'currency') setStep('basic');
    else if (step === 'accounts') setStep('currency');
    else if (step === 'categories') setStep('accounts');
  };

  const handleCreate = () => {
    if (name.trim()) {
      const initialAccounts = selectedAccounts.map(accName => {
        const def = DEFAULT_ACCOUNTS.find(a => a.name === accName);
        const custom = customAccounts.find(a => a.name === accName);
        return {
          name: accName,
          type: def?.type || 'ASSET',
          icon: def?.icon || custom?.icon || 'wallet',
        };
      });

      const initialCategories = selectedCategories.map(catName => {
        const def = DEFAULT_CATEGORIES.find(c => c.name === catName);
        const custom = customCategories.find(c => c.name === catName);
        return {
          name: catName,
          type: def?.type || custom?.type || 'EXPENSE',
          icon: def?.icon || custom?.icon || 'tag',
        };
      });

      onCreate(name.trim(), icon, {
        initialAccounts,
        initialCategories,
        currencyCode: selectedCurrency,
      });
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'basic':
        return (
          <Box flex={1}>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, paddingVertical: 24 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Stack gap="xl" flex={1} justifyContent="space-between">
                <Stack gap="md" align="center" paddingTop="xl">
                  <AppText variant="hero" style={{ textAlign: 'center' }}>
                    New Workplace
                  </AppText>
                  <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                    Choose a name and icon for your new workplace.
                  </AppText>
                </Stack>

                <Stack gap="xl">
                  <Stack align="center" gap="md">
                    <TouchableOpacity
                      onPress={() => setIconPickerVisible(true)}
                      style={[
                        styles.iconContainer,
                        { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                      ]}
                    >
                      <AppIcon name={icon} size={48} color={theme.primary} />
                      <Box
                        position="absolute"
                        bottom={-4}
                        right={-4}
                        background="primary"
                        borderRadius="full"
                        padding="xs"
                      >
                        <AppIcon name="edit" size={14} color={theme.surface} />
                      </Box>
                    </TouchableOpacity>
                  </Stack>

                  <AppInput
                    label="Workplace Name"
                    placeholder="e.g. My Business"
                    value={name}
                    onChangeText={setName}
                    autoFocus
                    onSubmitEditing={handleNext}
                  />

                  <AppButton
                    variant="primary"
                    size="lg"
                    onPress={handleNext}
                    disabled={!name.trim() || isCreating}
                  >
                    Next
                  </AppButton>
                  <AppButton variant="ghost" onPress={onClose} disabled={isCreating}>
                    Cancel
                  </AppButton>
                </Stack>
              </Stack>
            </ScrollView>
          </Box>
        );
      case 'currency':
        return (
          <Box flex={1}>
            <SelectableGrid
              title="Workplace Currency"
              subtitle="Select the primary currency for this workplace."
              items={currencyItems}
              selectedIds={[selectedCurrency]}
              onToggle={setSelectedCurrency}
              onContinue={handleNext}
              onBack={handleBack}
              isCompleting={false}
              disableAnimation={true}
              bottomContent={
                <Box>
                  <AppInput
                    placeholder="Search currency..."
                    value={currencySearchQuery}
                    onChangeText={setCurrencySearchQuery}
                    accessibilityLabel="Search currency"
                  />
                </Box>
              }
              renderSubtitle={(item, isSelected) => (
                <AppText
                  variant="caption"
                  color="secondary"
                  style={{
                    color: isSelected ? theme.primary : theme.textSecondary,
                  }}
                >
                  {item.subtitle}
                </AppText>
              )}
            />
          </Box>
        );
      case 'accounts':
        return (
          <Box flex={1}>
            <SelectableGrid
              title="Select Accounts"
              subtitle="Choose the accounts you want to start with."
              items={accountItems}
              selectedIds={selectedAccounts}
              onToggle={handleToggleAccount}
              onContinue={handleNext}
              onBack={handleBack}
              isCompleting={false}
              disableAnimation={true}
              bottomContent={
                <CategoryCreationBar
                  placeholder="Add custom account..."
                  onAdd={handleAddCustomAccount}
                  defaultIcon="wallet"
                />
              }
            />
          </Box>
        );
      case 'categories':
        return (
          <Box flex={1}>
            <SelectableGrid
              title="Select Categories"
              subtitle="Choose the categories for your transactions."
              items={categoryItems}
              selectedIds={selectedCategories}
              onToggle={handleToggleCategory}
              onContinue={handleCreate}
              onBack={handleBack}
              isCompleting={isCreating}
              footerActionLabel={isCreating ? 'Creating...' : 'Create Workplace'}
              disableAnimation={true}
              renderIcon={renderCategoryIcon}
              renderSubtitle={renderCategorySubtitle}
              bottomContent={
                <CategoryCreationBar
                  placeholder="Add custom category..."
                  onAdd={handleAddCustomCategory}
                  defaultIcon="tag"
                  showTypeToggle
                  typeLabels={{ income: 'Income', expense: 'Expense' }}
                />
              }
            />
          </Box>
        );
    }
  };

  return (
    <Modal visible={visible} animationType="none" transparent={false} onRequestClose={onClose}>
      <Page
        edges={['top', 'bottom']}
        keyboardAvoiding
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 80}
      >
        <Box flex={1}>
          <Inset horizontal="lg" top="md" bottom={0} flex={1}>
            <Box flex={1} style={{ alignSelf: 'center', width: '100%' }}>
              <StepIndicator
                currentStep={
                  step === 'basic' ? 1 : step === 'currency' ? 2 : step === 'accounts' ? 3 : 4
                }
                totalSteps={4}
              />
              {renderStep()}
            </Box>
          </Inset>
        </Box>
      </Page>
      <IconPickerModal
        visible={iconPickerVisible}
        onClose={() => setIconPickerVisible(false)}
        onSelect={selectedIcon => {
          setIcon(selectedIcon);
          setIconPickerVisible(false);
        }}
        selectedIcon={isValidIconName(icon) ? (icon as IconName) : 'briefcase'}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
});
