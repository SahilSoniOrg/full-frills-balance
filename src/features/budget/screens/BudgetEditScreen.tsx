import { BudgetEditView } from '@/src/features/budget/components/BudgetEditView';
import {
  type BudgetEditRouteParams,
  useBudgetEditViewModel,
} from '@/src/features/budget/hooks/useBudgetEditViewModel';
import { useLocalSearchParams } from 'expo-router';

export default function BudgetEditScreen() {
  const params = useLocalSearchParams<BudgetEditRouteParams>();
  const vm = useBudgetEditViewModel(params);
  return <BudgetEditView {...vm} />;
}
