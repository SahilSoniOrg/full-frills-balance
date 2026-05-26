import { FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppNavigation } from '@/src/utils/navigation';
import { BudgetListView } from '../components/BudgetListView';

export default function BudgetListScreen() {
  return (
    <Screen showBack={true} title="Budgets">
      <BudgetListView />
      <FloatingActionButton
        onPress={() => AppNavigation.toBudgetForm()}
        label="New Budget"
        placement="end"
        accessibilityLabel="Create a new budget"
      />
    </Screen>
  );
}
