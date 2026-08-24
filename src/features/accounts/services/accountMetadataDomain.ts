import { IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import type { PlainAccountMetadata } from '@/src/types/plainDtos';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { SerializedAccountMetadataPayload } from '@/src/types/plainDtos';

export interface AccountMetadataValues {
  statementDay: string;
  dueDay: string;
  creditLimitAmount: string;
  apr: string;
  emiDay: string;
  loanTenureMonths: string;
  minimumPaymentAmount: string;
  minimumPaymentPercent: string;
  isMinPaymentOnly: boolean;
  payFromAccountId: AccountId;
  notes: string;
}

export function createDefaultAccountMetadataValues(
  existingMetadata?: PlainAccountMetadata | null,
): AccountMetadataValues {
  if (!existingMetadata) {
    return {
      statementDay: '',
      dueDay: '',
      creditLimitAmount: '',
      apr: '',
      emiDay: '',
      loanTenureMonths: '',
      minimumPaymentAmount: '',
      minimumPaymentPercent: '',
      isMinPaymentOnly: false,
      payFromAccountId: EMPTY_ACCOUNT_ID,
      notes: '',
    };
  }

  return {
    statementDay: existingMetadata.statementDay?.toString() || '',
    dueDay: existingMetadata.dueDay?.toString() || '',
    creditLimitAmount: existingMetadata.creditLimitAmount?.toString() || '',
    apr: existingMetadata.aprBps ? (existingMetadata.aprBps / 100).toString() : '',
    emiDay: existingMetadata.emiDay?.toString() || '',
    loanTenureMonths: existingMetadata.loanTenureMonths?.toString() || '',
    minimumPaymentAmount: existingMetadata.minimumPaymentAmount?.toString() || '',
    minimumPaymentPercent: existingMetadata.minimumPaymentPercent?.toString() || '',
    isMinPaymentOnly: existingMetadata.minPaymentOnly || false,
    payFromAccountId: existingMetadata.payFromAccountId || EMPTY_ACCOUNT_ID,
    notes: existingMetadata.notes || '',
  };
}

export function resolveAccountIcon(
  accountType: AccountType,
  customIcon?: IconName | null,
): IconName {
  if (customIcon) return customIcon;
  const isCategory = accountType === AccountType.INCOME || accountType === AccountType.EXPENSE;
  return isCategory ? 'tag' : 'wallet';
}

export function validateAccountMetadata(
  values: AccountMetadataValues,
  accountType: AccountType,
): string | null {
  const isCategory = accountType === AccountType.INCOME || accountType === AccountType.EXPENSE;
  if (isCategory) return null;

  if (accountType === AccountType.LIABILITY) {
    const dayFields: Record<string, string> = {
      'Statement Day': values.statementDay,
      'Due Day': values.dueDay,
      'EMI Day': values.emiDay,
    };

    const minDay = AppConfig.constants.validation.minDayOfMonth;
    const maxDay = AppConfig.constants.validation.maxDayOfMonth;

    for (const [name, value] of Object.entries(dayFields)) {
      if (value) {
        const day = parseInt(value, 10);
        if (isNaN(day) || day < minDay || day > maxDay) {
          return `${name} must be between ${minDay} and ${maxDay}`;
        }
      }
    }

    if (values.apr) {
      const aprVal = parseFloat(values.apr);
      const minApr = AppConfig.constants.validation.minAprPercent;
      const maxApr = AppConfig.constants.validation.maxAprPercent;
      if (isNaN(aprVal) || aprVal < minApr || aprVal > maxApr) {
        return `APR must be between ${minApr} and ${maxApr}`;
      }
    }

    if (values.minimumPaymentPercent) {
      const percent = parseFloat(values.minimumPaymentPercent);
      if (isNaN(percent) || percent < 0 || percent > 100) {
        return 'Minimum payment percent must be between 0 and 100';
      }
    }
  }

  return null;
}

export function serializeAccountMetadata(
  values: AccountMetadataValues,
  accountType: AccountType,
  hasExistingRecord: boolean = false,
): SerializedAccountMetadataPayload | undefined {
  const isCategory = accountType === AccountType.INCOME || accountType === AccountType.EXPENSE;
  if (isCategory) return undefined;

  const payload: SerializedAccountMetadataPayload = {
    statementDay: values.statementDay ? parseInt(values.statementDay, 10) : null,
    dueDay: values.dueDay ? parseInt(values.dueDay, 10) : null,
    creditLimitAmount: values.creditLimitAmount ? parseFloat(values.creditLimitAmount) : null,
    aprBps: values.apr ? Math.round(parseFloat(values.apr) * 100) : null,
    emiDay: values.emiDay ? parseInt(values.emiDay, 10) : null,
    loanTenureMonths: values.loanTenureMonths ? parseInt(values.loanTenureMonths, 10) : null,
    minimumPaymentAmount: values.minimumPaymentAmount
      ? parseFloat(values.minimumPaymentAmount)
      : null,
    minimumPaymentPercent: values.minimumPaymentPercent
      ? parseFloat(values.minimumPaymentPercent)
      : null,
    minPaymentOnly: values.isMinPaymentOnly,
    payFromAccountId: values.payFromAccountId || null,
    notes: values.notes || null,
  };

  const hasAnyValue = Object.values(payload).some(val => val !== null && val !== false);
  if (!hasAnyValue && !hasExistingRecord) {
    return undefined;
  }

  return payload;
}
