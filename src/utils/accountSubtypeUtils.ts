import { AccountSubtype } from '@/src/data/models/Account';

/**
 * Liquid assets are accounts that can be easily converted to cash 
 * or used for spending within a short timeframe.
 */
export const LIQUID_ASSET_SUBTYPES: readonly AccountSubtype[] = [
    AccountSubtype.CASH,
    AccountSubtype.WALLET,
    AccountSubtype.BANK_CHECKING,
    AccountSubtype.BANK_SAVINGS,
    AccountSubtype.MONEY_MARKET,
    AccountSubtype.EMERGENCY_FUND,
    AccountSubtype.TRANSFER_CLEARING, // Practically liquid while in transit
];

/**
 * Checks if a subtype belongs to a liquid asset.
 */
export function isLiquidAssetSubtype(subtype?: AccountSubtype): boolean {
    if (!subtype) return false;
    return LIQUID_ASSET_SUBTYPES.includes(subtype);
}

/**
 * Subtypes that signify debt/liability that should be considered in "net cash"
 */
export const LIQUID_LIABILITY_SUBTYPES: readonly AccountSubtype[] = [
    AccountSubtype.CREDIT_CARD,
    AccountSubtype.LINE_OF_CREDIT,
    AccountSubtype.OVERDRAFT,
];

export function isLiquidLiabilitySubtype(subtype?: AccountSubtype): boolean {
    if (!subtype) return false;
    return LIQUID_LIABILITY_SUBTYPES.includes(subtype);
}
export const LOAN_SUBTYPES: readonly AccountSubtype[] = [
    AccountSubtype.LOAN,
    AccountSubtype.MORTGAGE,
    AccountSubtype.STUDENT_LOAN,
    AccountSubtype.AUTO_LOAN,
    AccountSubtype.PERSONAL_LOAN,
];

export function isLoanSubtype(subtype?: AccountSubtype): boolean {
    if (!subtype) return false;
    return LOAN_SUBTYPES.includes(subtype);
}
