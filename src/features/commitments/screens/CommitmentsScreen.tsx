import { CommitmentsPagerLeaf } from '../components/CommitmentsPagerLeaf';

export type CommitmentsTab = 'budgets' | 'planned';

export function CommitmentsPage({ tab = 'budgets' }: { tab?: CommitmentsTab }) {
  return <CommitmentsPagerLeaf tab={tab} />;
}

export default CommitmentsPage;
