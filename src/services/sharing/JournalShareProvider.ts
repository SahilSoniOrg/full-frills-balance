import { JournalDisplayType } from '../../types/domain';
import { CurrencyFormatter } from '../../utils/currencyFormatter';
import { formatDate } from '../../utils/dateUtils';
import { ShareFormat, ShareProvider } from '../SharingService';

export interface ShareableJournalEntry {
  id: string;
  date: number;
  description: string;
  amount: number;
  currencyCode: string;
  displayType: JournalDisplayType;
}

export type TypeMeta = { emoji: string; label: string };

export interface JournalShareOptions {
  title?: string;
  filename?: string;
  includeTime?: boolean;
  sort?: 'asc' | 'desc' | 'none';
  showEmojis?: boolean;
  typeMetaOverride?: Record<JournalDisplayType, TypeMeta>;
  defaultCurrency?: string;
}

const DEFAULT_TYPE_META: Record<JournalDisplayType, TypeMeta> = {
  [JournalDisplayType.INCOME]: { emoji: '🟢', label: 'Income' },
  [JournalDisplayType.EXPENSE]: { emoji: '🔴', label: 'Expense' },
  [JournalDisplayType.MIXED]: { emoji: '⚪', label: 'Mixed' },
  [JournalDisplayType.TRANSFER]: { emoji: '⚪', label: 'Transfer' },
};

export class JournalShareProvider implements ShareProvider {
  public id = 'journal-list';
  public title: string;
  public filename: string;
  public supportedFormats = [ShareFormat.TEXT, ShareFormat.CSV, ShareFormat.MARKDOWN];

  constructor(
    private entries: ShareableJournalEntry[],
    private options: JournalShareOptions = {},
  ) {
    this.title = options.title || 'Journal Report';
    // Filename uniqueness is handled by SharingService
    this.filename = options.filename || 'journal-report';
  }

  getContent(format: ShareFormat): string {
    if (this.entries.length === 0) return 'No journal entries to share';

    // Apply sorting
    const sortOrder = this.options.sort || 'desc';
    const sorted =
      sortOrder === 'none'
        ? this.entries
        : [...this.entries].sort((a, b) =>
            sortOrder === 'asc' ? a.date - b.date : b.date - a.date,
          );

    // Disable emojis for non-TEXT formats automatically
    const effectiveOptions = {
      ...this.options,
      showEmojis: format === ShareFormat.TEXT ? this.options.showEmojis !== false : false,
    };

    // Stable timestamp for the entire report
    const generatedAt = Date.now();

    let content: string;
    switch (format) {
      case ShareFormat.CSV:
        content = this.formatAsCSV(sorted, generatedAt);
        break;
      case ShareFormat.MARKDOWN:
        content = this.formatAsMarkdown(sorted, generatedAt);
        break;
      case ShareFormat.TEXT:
      default:
        content = this.formatAsText(sorted, effectiveOptions, generatedAt);
        break;
    }

    // Tier 3: Normalize line endings to Windows-compatible \r\n
    return content.replace(/\r?\n/g, '\r\n');
  }

  private formatAsText(
    entries: ShareableJournalEntry[],
    options: JournalShareOptions,
    generatedAt: number,
  ): string {
    const lines: string[] = [];
    const typeMeta = options.typeMetaOverride || DEFAULT_TYPE_META;
    const defaultCurrency = options.defaultCurrency;

    // Tier 3: Consistent header formatting
    lines.push(`💰 ${this.title.toUpperCase()}`);
    lines.push(`🕒 Generated: ${formatDate(generatedAt, { includeTime: true })}`);

    // Tier 3: Dataset warning
    if (entries.length > 500) {
      lines.push('⚠️ Large dataset - some messaging apps may truncate this content.');
    }

    lines.push('----------------------------------------');

    const currencyTotals: Record<string, { income: number; expense: number }> = {};
    const currencies = new Set<string>();

    entries.forEach(t => {
      const dateStr = formatDate(t.date, { includeTime: options.includeTime ?? false });
      const amountStr = CurrencyFormatter.format(t.amount, t.currencyCode);

      const meta = typeMeta[t.displayType] || typeMeta[JournalDisplayType.MIXED];
      const prefix = options.showEmojis ? `${meta.emoji} ` : '';

      // Tier 1/2: Basic sanitization for text (rarely needed but good practice)
      const safeDescription = t.description.replace(/\n/g, ' ');

      lines.push(`${prefix}${dateStr} | ${safeDescription} | ${amountStr}`);

      // Tier 1: Mixed currency grouping
      if (!currencyTotals[t.currencyCode]) {
        currencyTotals[t.currencyCode] = { income: 0, expense: 0 };
        currencies.add(t.currencyCode);
      }

      if (t.displayType === JournalDisplayType.INCOME) {
        currencyTotals[t.currencyCode].income += t.amount;
      } else if (t.displayType === JournalDisplayType.EXPENSE) {
        currencyTotals[t.currencyCode].expense += t.amount;
      }
    });

    lines.push('----------------------------------------');
    lines.push('SUMMARY:');

    // Tier 1: Sum-honesty (grouped by currency)
    const isMixed = currencies.size > 1;
    if (isMixed) {
      lines.push('⚠️ Multiple currencies detected. Totals are grouped by currency.');
    }

    Array.from(currencies)
      .sort()
      .forEach(code => {
        const totals = currencyTotals[code];
        const net = totals.income - totals.expense;

        if (isMixed) lines.push(`[${code}]`);
        lines.push(`✅ Income:  ${CurrencyFormatter.format(totals.income, code)}`);
        lines.push(`❌ Expense: ${CurrencyFormatter.format(totals.expense, code)}`);
        lines.push(`📊 Net:     ${CurrencyFormatter.format(net, code)}`);
        if (isMixed) lines.push('');
      });

    if (entries.length === 0) {
      if (defaultCurrency) {
        lines.push(`No data available for ${defaultCurrency}`);
      } else {
        lines.push('No journal entries available for this period');
      }
    }

    return lines.join('\n');
  }

  private formatAsCSV(entries: ShareableJournalEntry[], _generatedAt: number): string {
    const headers = ['Date', 'Description', 'Type', 'Amount', 'Currency'];

    // Tier 2: CSV Injection protection
    const makeSafe = (value: string) => {
      const str = value;
      return /^[=+\-@]/.test(str) ? `'${str}` : str;
    };

    const rows = entries.map(t => [
      formatDate(t.date, { includeTime: true }),
      `"${makeSafe(t.description).replace(/"/g, '""')}"`,
      t.displayType,
      t.amount.toString(),
      t.currencyCode,
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  private formatAsMarkdown(entries: ShareableJournalEntry[], generatedAt: number): string {
    const lines: string[] = [];
    lines.push(`# ${this.title}`);
    lines.push(`**Generated:** ${formatDate(generatedAt, { includeTime: true })}`);

    if (this.entries.length > 500) {
      lines.push('');
      lines.push(
        '> ⚠️ **Warning:** Large dataset detected. Display may be truncated by some viewers.',
      );
    }

    lines.push('');
    lines.push('| Date | Description | Type | Amount |');
    lines.push('| :--- | :--- | :--- | :--- |');

    // Tier 2: Enhanced Markdown escaping
    const escapeMarkdown = (text: string) => {
      return text
        .replace(/\|/g, '\\|') // Pipes
        .replace(/`/g, '\\`') // Backticks
        .replace(/\n/g, ' '); // Newlines (break layout)
    };

    const makeSafe = (value: string) => {
      const str = value;
      // Even in Markdown, prefixing dangerous math chars is good for safety when copied to Excel
      return /^[=+\-@]/.test(str) ? `'${str}` : str;
    };

    entries.forEach(t => {
      const dateStr = formatDate(t.date, { includeTime: this.options.includeTime ?? false });
      const amountStr = CurrencyFormatter.format(t.amount, t.currencyCode);
      const description = escapeMarkdown(makeSafe(t.description));
      lines.push(`| ${dateStr} | ${description} | ${t.displayType} | ${amountStr} |`);
    });

    return lines.join('\n');
  }
}
