import { roundToPrecision } from './money';

export const sanitizeInput = (input: string): string => {
  return input
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/[<>]/g, '') // Remove potential HTML tags
}

export const validateAccountName = (name: string): { isValid: boolean; error?: string } => {
  const sanitizedName = sanitizeInput(name)

  if (!sanitizedName) {
    return { isValid: false, error: 'Account name is required' }
  }

  if (sanitizedName.length < 2) {
    return { isValid: false, error: 'Account name must be at least 2 characters' }
  }

  if (sanitizedName.length > 100) {
    return { isValid: false, error: 'Account name must be less than 100 characters' }
  }

  if (!/^[a-zA-Z0-9\s\-_&()]+$/.test(sanitizedName)) {
    return {
      isValid: false,
      error: 'Account name can only contain letters, numbers, spaces, and basic punctuation'
    }
  }

  return { isValid: true }
}

export const validateCurrencyCode = (code: string): { isValid: boolean; error?: string } => {
  const sanitizedCode = sanitizeInput(code).toUpperCase()

  if (!sanitizedCode) {
    return { isValid: false, error: 'Currency code is required' }
  }

  if (sanitizedCode.length !== 3) {
    return { isValid: false, error: 'Currency code must be exactly 3 characters' }
  }

  if (!/^[A-Z]{3}$/.test(sanitizedCode)) {
    return { isValid: false, error: 'Currency code must contain only letters' }
  }

  return { isValid: true }
}

export const validateDescription = (description: string): { isValid: boolean; error?: string } => {
  const sanitizedDescription = sanitizeInput(description)

  if (sanitizedDescription && sanitizedDescription.length > 500) {
    return { isValid: false, error: 'Description must be less than 500 characters' }
  }

  return { isValid: true }
}


export const sanitizeAmount = (amount: string | number, precision = 2): number | null => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) : amount

  if (isNaN(numAmount) || !isFinite(numAmount)) {
    return null
  }

  return roundToPrecision(numAmount, precision)
}
