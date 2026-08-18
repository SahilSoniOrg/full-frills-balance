import { formatAccountSubtypeLabel, isAccountSubtype } from '@/src/types/accountSubtype';

export function formatCategoryLabel(category: string): string {
  if (isAccountSubtype(category)) {
    return formatAccountSubtypeLabel(category);
  }
  return category;
}
