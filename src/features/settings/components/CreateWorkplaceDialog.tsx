import { IconPickerModal } from '@/src/components/common/IconPickerModal';
import { WorkplaceAccountSelectionStep } from '@/src/components/common/workplace-setup/WorkplaceAccountSelectionStep';
import { WorkplaceBasicInfoStep } from '@/src/components/common/workplace-setup/WorkplaceBasicInfoStep';
import { WorkplaceCategorySelectionStep } from '@/src/components/common/workplace-setup/WorkplaceCategorySelectionStep';
import { WorkplaceCurrencyStep } from '@/src/components/common/workplace-setup/WorkplaceCurrencyStep';
import { WorkplaceSetupLayout } from '@/src/components/common/workplace-setup/WorkplaceSetupLayout';
import { AppButton, AppIcon, AppText, IconName, isValidIconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { Box, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountType } from '@/src/types/domain';
import { useState } from 'react';
import { Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

interface CreateWorkplaceDialogProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (
    name: string,
    icon: IconName,
    options: {
      initialAccounts?: { name: string; type: AccountType; icon: IconName }[];
      initialCategories?: { name: string; type: AccountType; icon: IconName }[];
      currencyCode: string;
    },
  ) => void;
  isCreating: boolean;
}

type Step = 'basic' | 'currency' | 'accounts' | 'categories' | 'review';

export function CreateWorkplaceDialog(props: CreateWorkplaceDialogProps) {
  if (!props.visible) return null;

  return (
    <Modal
      visible={props.visible}
      animationType="none"
      transparent={false}
      statusBarTranslucent={true}
      onRequestClose={props.onClose}
    >
      <SafeAreaProvider>
        <CreateWorkplaceDialogContent {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

function CreateWorkplaceDialogContent({
  onClose,
  onCreate,
  isCreating,
}: CreateWorkplaceDialogProps) {
  const { theme } = useTheme();
  const [step, setStep] = useState<Step>('basic');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<IconName>('briefcase');
  const [selectedCurrency, setSelectedCurrency] = useState<string>(AppConfig.defaultCurrency);
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
  const [iconPickerVisible, setIconPickerVisible] = useState(false);

  const handleCreate = () => {
    const initialAccounts = selectedAccounts.map(accName => {
      const def = DEFAULT_ACCOUNTS.find(a => a.name === accName);
      const custom = customAccounts.find(a => a.name === accName);
      return {
        name: accName,
        type: def?.type || AccountType.ASSET,
        icon: (def?.icon || custom?.icon || 'wallet') as IconName,
      };
    });

    const initialCategories = selectedCategories.map(catName => {
      const def = DEFAULT_CATEGORIES.find(c => c.name === catName);
      const custom = customCategories.find(c => c.name === catName);
      const catType = def?.type || custom?.type;
      return {
        name: catName,
        type: catType === 'INCOME' ? AccountType.INCOME : AccountType.EXPENSE,
        icon: (def?.icon || custom?.icon || 'tag') as IconName,
      };
    });

    onCreate(name.trim(), icon, {
      initialAccounts,
      initialCategories,
      currencyCode: selectedCurrency,
    });
  };

  const renderStep = () => {
    switch (step) {
      case 'basic':
        return (
          <WorkplaceBasicInfoStep
            title="New Workplace"
            subtitle="Choose a name and icon for your new workplace."
            name={name}
            onNameChange={setName}
            icon={icon}
            onIconPress={() => setIconPickerVisible(true)}
            onContinue={() => setStep('currency')}
            onCancel={onClose}
          />
        );
      case 'currency':
        return (
          <WorkplaceCurrencyStep
            selectedCurrency={selectedCurrency}
            onSelectCurrency={setSelectedCurrency}
            onContinue={() => setStep('accounts')}
            onBack={() => setStep('basic')}
            isCompleting={false}
          />
        );
      case 'accounts':
        return (
          <WorkplaceAccountSelectionStep
            selectedAccounts={selectedAccounts}
            customAccounts={customAccounts}
            onToggleAccount={name =>
              setSelectedAccounts(prev =>
                prev.includes(name) ? prev.filter(a => a !== name) : [...prev, name],
              )
            }
            onAddCustomAccount={(name, _type, icon) => {
              setSelectedAccounts(prev => (prev.includes(name) ? prev : [...prev, name]));
              setCustomAccounts(prev => [...prev, { name, icon }]);
            }}
            onContinue={() => setStep('categories')}
            onBack={() => setStep('currency')}
            isCompleting={false}
          />
        );
      case 'categories':
        return (
          <WorkplaceCategorySelectionStep
            selectedCategories={selectedCategories}
            customCategories={customCategories}
            onToggleCategory={name =>
              setSelectedCategories(prev =>
                prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name],
              )
            }
            onAddCustomCategory={(name, type, icon) => {
              setSelectedCategories(prev => (prev.includes(name) ? prev : [...prev, name]));
              setCustomCategories(prev => [...prev, { name, type, icon }]);
            }}
            onContinue={() => setStep('review')}
            onBack={() => setStep('accounts')}
            isCompleting={false}
          />
        );
      case 'review':
        return (
          <Box flex={1} justifyContent="center" padding="md">
            <Stack gap="xl" align="center">
              <Box
                background="primary"
                backgroundOpacity="selection"
                borderRadius="full"
                padding="xl"
                style={{ marginBottom: 16 }}
              >
                <AppIcon
                  name={isValidIconName(icon) ? icon : 'briefcase'}
                  size={48}
                  color={theme.primary}
                />
              </Box>

              <Stack gap="xs" align="center">
                <AppText variant="title">{name}</AppText>
                <AppText variant="body" color="secondary">
                  {selectedCurrency} • {selectedAccounts.length} Accounts •{' '}
                  {selectedCategories.length} Categories
                </AppText>
              </Stack>

              <Box width="100%" marginTop="xl">
                <AppButton
                  variant="primary"
                  size="lg"
                  onPress={handleCreate}
                  loading={isCreating}
                  disabled={isCreating}
                >
                  Create Workplace
                </AppButton>
                <AppButton
                  variant="ghost"
                  size="md"
                  onPress={() => setStep('categories')}
                  disabled={isCreating}
                  style={{ marginTop: 8 }}
                >
                  Back
                </AppButton>
              </Box>
            </Stack>
          </Box>
        );
      default:
        return null;
    }
  };

  const currentStep =
    step === 'basic'
      ? 1
      : step === 'currency'
        ? 2
        : step === 'accounts'
          ? 3
          : step === 'categories'
            ? 4
            : 5;

  return (
    <WorkplaceSetupLayout currentStep={currentStep} totalSteps={5}>
      {renderStep()}

      <IconPickerModal
        visible={iconPickerVisible}
        onClose={() => setIconPickerVisible(false)}
        onSelect={setIcon}
        selectedIcon={icon}
      />
    </WorkplaceSetupLayout>
  );
}
