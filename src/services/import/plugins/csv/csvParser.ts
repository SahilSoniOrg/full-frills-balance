/**
 * Pure CSV parsing, row tokenization, number sanitization, and column detection utilities.
 */

export interface CsvColumnMapping {
  dateCol: number;
  descCol: number;
  amountCol?: number;
  debitCol?: number;
  creditCol?: number;
  categoryCol?: number;
  accountCol?: number;
  notesCol?: number;
}

export interface HeaderDetectionResult {
  headerIndex: number;
  mapping: CsvColumnMapping;
}

/**
 * Robust CSV row tokenizer supporting quotes, escaped quotes, and commas inside quotes.
 */
export function parseCsvRows(text: string, delimiter?: string): string[][] {
  const cleanText = text.replace(/^\uFEFF/, ''); // Remove BOM if present
  if (!cleanText.trim()) return [];

  // Auto-detect delimiter if not specified
  if (!delimiter) {
    const firstLine = cleanText.split(/\r?\n/)[0] || '';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;

    if (tabCount > commaCount && tabCount > semiCount) {
      delimiter = '\t';
    } else if (semiCount > commaCount) {
      delimiter = ';';
    } else {
      delimiter = ',';
    }
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // Skip \n
      }
      currentRow.push(currentField.trim());
      currentField = '';
      if (currentRow.some(field => field.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(field => field.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Clean numeric string representation into a float amount.
 * Handles currencies ($1,234.56, -€50.00, (100.00), etc.).
 */
export function parseAmountString(value: string): number | null {
  if (!value || typeof value !== 'string') return null;

  let str = value.trim();
  if (!str) return null;

  // Handle accounting parentheses negative: (100.00) -> -100.00
  let isNegative = false;
  if (str.startsWith('(') && str.endsWith(')')) {
    isNegative = true;
    str = str.substring(1, str.length - 1).trim();
  }

  if (str.startsWith('-') || str.endsWith('-')) {
    isNegative = true;
    str = str.replace(/-/g, '').trim();
  }

  if (str.startsWith('+')) {
    str = str.substring(1).trim();
  }

  // Remove currency symbols and alphabetic characters (like USD, $, €, ₹)
  str = str.replace(/[^\d.,]/g, '');
  if (!str) return null;

  // Handle comma as decimal separator (e.g. 1.234,56 or 1234,56)
  if (str.includes(',') && !str.includes('.')) {
    str = str.replace(/,/g, '.');
  } else if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // European format: 1.234,56 -> 1234.56
      str = str.replace(/\./g, '').replace(/,/g, '.');
    } else {
      // Standard format: 1,234.56 -> 1234.56
      str = str.replace(/,/g, '');
    }
  }

  const num = parseFloat(str);
  if (isNaN(num)) return null;

  return isNegative ? -Math.abs(num) : num;
}

/**
 * Parse a flexible date string into timestamp ms.
 */
export function parseFlexibleDate(dateStr: string): number {
  if (!dateStr) return Date.now();

  const clean = dateStr.trim();

  // Try standard Date.parse
  const direct = new Date(clean).getTime();
  if (!isNaN(direct) && direct > 0) return direct;

  // Try DD/MM/YYYY or DD-MM-YYYY
  const parts = clean.split(/[/.-]/);
  if (parts.length === 3) {
    const p0 = parseInt(parts[0], 10);
    const p1 = parseInt(parts[1], 10);
    const p2 = parseInt(parts[2], 10);

    // Year in 3rd position (e.g. 31/12/2023 or 12/31/2023)
    if (p2 > 1000) {
      if (p0 > 12) {
        // Must be DD/MM/YYYY
        return new Date(p2, p1 - 1, p0).getTime();
      } else {
        // Default to MM/DD/YYYY
        return new Date(p2, p0 - 1, p1).getTime();
      }
    }
  }

  return Date.now();
}

/**
 * Detect column indexes for date, description, amount/debit/credit, categories, accounts, and notes.
 */
export function detectColumns(headers: string[]): CsvColumnMapping | null {
  const normalized = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  let dateCol = -1;
  let descCol = -1;
  let amountCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  let categoryCol = -1;
  let accountCol = -1;
  let notesCol = -1;

  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i];

    if (
      dateCol === -1 &&
      (h.includes('date') ||
        h === 'dt' ||
        h === 'timestamp' ||
        h === 'time' ||
        h === 'bookingdate' ||
        h === 'valuedate' ||
        h === 'postingdate' ||
        h === 'txndate')
    ) {
      dateCol = i;
    } else if (
      descCol === -1 &&
      (h.includes('desc') ||
        h.includes('payee') ||
        h.includes('narration') ||
        h.includes('merchant') ||
        h.includes('particulars') ||
        h.includes('title') ||
        h.includes('details') ||
        h === 'name' ||
        h === 'memo' ||
        h.includes('remark'))
    ) {
      descCol = i;
    } else if (
      debitCol === -1 &&
      (h.includes('debit') ||
        h.includes('withdrawal') ||
        h.includes('outflow') ||
        h.includes('spent') ||
        h.includes('expense') ||
        h.includes('paidout') ||
        h.includes('payment') ||
        h === 'dr')
    ) {
      debitCol = i;
    } else if (
      creditCol === -1 &&
      (h.includes('credit') ||
        h.includes('deposit') ||
        h.includes('inflow') ||
        h.includes('income') ||
        h.includes('paidin') ||
        h.includes('received') ||
        h === 'cr')
    ) {
      creditCol = i;
    } else if (
      amountCol === -1 &&
      (h.includes('amount') ||
        h.includes('total') ||
        h === 'amt' ||
        h === 'sum' ||
        h === 'net' ||
        h === 'netamount' ||
        h === 'txnamount')
    ) {
      amountCol = i;
    } else if (
      categoryCol === -1 &&
      (h.includes('category') || h.includes('cat') || h === 'tag' || h === 'type')
    ) {
      categoryCol = i;
    } else if (
      accountCol === -1 &&
      (h.includes('account') ||
        h.includes('wallet') ||
        h.includes('card') ||
        h.includes('source') ||
        h === 'acc')
    ) {
      accountCol = i;
    } else if (
      notesCol === -1 &&
      (h.includes('note') || h.includes('comment') || h.includes('memo'))
    ) {
      notesCol = i;
    }
  }

  // Must have at least Date and one Amount column (or debit/credit)
  if (dateCol === -1) return null;
  if (amountCol === -1 && debitCol === -1 && creditCol === -1) return null;

  return {
    dateCol,
    descCol: descCol !== -1 ? descCol : dateCol === 0 ? 1 : 0,
    amountCol: amountCol !== -1 ? amountCol : undefined,
    debitCol: debitCol !== -1 ? debitCol : undefined,
    creditCol: creditCol !== -1 ? creditCol : undefined,
    categoryCol: categoryCol !== -1 ? categoryCol : undefined,
    accountCol: accountCol !== -1 ? accountCol : undefined,
    notesCol: notesCol !== -1 ? notesCol : undefined,
  };
}

/**
 * Scan first N rows to locate the header row, automatically skipping metadata preambles.
 */
export function findHeaderRow(rows: string[][]): HeaderDetectionResult | null {
  const maxScan = Math.min(rows.length, 25);
  for (let i = 0; i < maxScan; i++) {
    const mapping = detectColumns(rows[i]);
    if (mapping) {
      return { headerIndex: i, mapping };
    }
  }
  return null;
}
