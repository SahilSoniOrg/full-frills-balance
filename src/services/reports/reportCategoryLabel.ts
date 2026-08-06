import { formatAccountSubtypeLabel, isAccountSubtype } from '@/src/data/models/Account';

export function formatCategoryLabel(category: string): string {
  if (isAccountSubtype(category)) {
    return formatAccountSubtypeLabel(category);
  }
  return category;
}
