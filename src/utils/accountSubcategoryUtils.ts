import { AccountSubcategory } from '@/src/data/models/Account';

/**
 * Liquid assets are accounts that can be easily converted to cash 
 * or used for spending within a short timeframe.
 */
export const LIQUID_ASSET_SUBCATEGORIES: readonly AccountSubcategory[] = [
    AccountSubcategory.CASH,
    AccountSubcategory.WALLET,
    AccountSubcategory.BANK_CHECKING,
    AccountSubcategory.BANK_SAVINGS,
    AccountSubcategory.MONEY_MARKET,
    AccountSubcategory.EMERGENCY_FUND,
    AccountSubcategory.TRANSFER_CLEARING, // Practically liquid while in transit
];

/**
 * Checks if a subcategory belongs to a liquid asset.
 */
export function isLiquidAssetSubcategory(subcategory?: AccountSubcategory): boolean {
    if (!subcategory) return false;
    return LIQUID_ASSET_SUBCATEGORIES.includes(subcategory);
}

/**
 * Subcategories that signify debt/liability that should be considered in "net cash"
 */
export const LIQUID_LIABILITY_SUBCATEGORIES: readonly AccountSubcategory[] = [
    AccountSubcategory.CREDIT_CARD,
    AccountSubcategory.LINE_OF_CREDIT,
    AccountSubcategory.OVERDRAFT,
];

export function isLiquidLiabilitySubcategory(subcategory?: AccountSubcategory): boolean {
    if (!subcategory) return false;
    return LIQUID_LIABILITY_SUBCATEGORIES.includes(subcategory);
}
