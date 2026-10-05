import { AppConfig } from '@/src/constants/app-config';
import { roundToPrecision } from '@/src/utils/money';

export const sanitizeInput = (input: string): string => {
  return input
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/[<>]/g, ''); // Remove potential HTML tags
};

export const sanitizeAmount = (
  amount: string | number,
  precision = AppConfig.constants.precision,
): number | null => {
  const numAmount =
    typeof amount === 'string' ? Number.parseFloat(amount.replace(/[^0-9.-]/g, '')) : amount;

  if (!Number.isFinite(numAmount)) {
    return null;
  }

  return roundToPrecision(numAmount, precision);
};
