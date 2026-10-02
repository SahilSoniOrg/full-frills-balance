import { AppConfig } from '@/src/constants/app-config';
import { roundToPrecision } from '@/src/utils/money';

export const sanitizeInput = (input: string): string => {
  return input
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/[<>]/g, ''); // Remove potential HTML tags
};

export const validateAccountName = (name: string): { isValid: boolean; error?: string } => {
  const sanitizedName = sanitizeInput(name);
  const { minAccountNameLength, maxAccountNameLength } = AppConfig.constants.validation;

  if (!sanitizedName) {
    return { isValid: false, error: AppConfig.strings.validation.accountNameRequired };
  }

  if (sanitizedName.length < minAccountNameLength) {
    return {
      isValid: false,
      error: AppConfig.strings.validation.accountNameTooShort(minAccountNameLength),
    };
  }

  if (sanitizedName.length > maxAccountNameLength) {
    return {
      isValid: false,
      error: AppConfig.strings.validation.accountNameTooLong(maxAccountNameLength),
    };
  }

  if (!/^[a-zA-Z0-9\s\-_&().,'#]+$/.test(sanitizedName)) {
    return {
      isValid: false,
      error: AppConfig.strings.validation.invalidCharacters,
    };
  }

  return { isValid: true };
};

export const sanitizeAmount = (
  amount: string | number,
  precision = AppConfig.constants.precision,
): number | null => {
  const numAmount =
    typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) : amount;

  if (isNaN(numAmount) || !isFinite(numAmount)) {
    return null;
  }

  return roundToPrecision(numAmount, precision);
};
