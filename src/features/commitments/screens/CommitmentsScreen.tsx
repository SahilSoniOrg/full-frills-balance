import { CommitmentsGroupPager } from '@/src/features/commitments/components/CommitmentsGroupPager';

export type { CommitmentsTab } from '@/src/features/commitments/components/CommitmentsGroupPager';

/** Both `commitments` and `planned-payments` routes render the same group shell. */
export function CommitmentsPage(_props?: { activeTab?: 'budgets' | 'planned' }) {
  return <CommitmentsGroupPager />;
}

export default CommitmentsPage;
