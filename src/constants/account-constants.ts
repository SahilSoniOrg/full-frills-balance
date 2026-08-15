import { IconName } from '@/src/types/domainIcons';

/**
 * Account-specific design and configuration constants.
 */

/**
 * Curated accent palette for per-account custom colors.
 * Tested for legibility across light and dark surfaces.
 */
export const ACCOUNT_COLOR_PALETTE: readonly string[] = [
  '#7DD3A8', // mint (brand)
  '#34D399', // emerald
  '#10B981', // green
  '#A3E635', // lime
  '#FACC15', // yellow
  '#FBBF24', // amber
  '#FB923C', // orange
  '#F87171', // red
  '#EF4444', // red strong
  '#FB7185', // rose
  '#F472B6', // pink
  '#EC4899', // pink strong
  '#E879F9', // fuchsia
  '#C084FC', // purple
  '#A78BFA', // violet
  '#8B5CF6', // violet strong
  '#818CF8', // indigo
  '#60A5FA', // blue
  '#3B82F6', // blue strong
  '#38BDF8', // sky
  '#22D3EE', // cyan
  '#2DD4BF', // teal
  '#94A3B8', // slate
  '#64748B', // slate dark
];

/**
 * Curated icon palette for account and category customization.
 */
export const ACCOUNT_ICON_PALETTE: readonly IconName[] = [
  'tag',
  'trendingUp',
  'shoppingCart',
  'coffee',
  'bus',
  'film',
  'shoppingBag',
  'document',
  'home',
  'wallet',
  'bank',
  'safe',
  'creditCard',
  'briefcase',
  'circle',
  'copy',
  'receipt',
  'calendar',
  'search',
  'edit',
  'delete',
  'arrowUp',
  'arrowDown',
  'swapHorizontal',
];
