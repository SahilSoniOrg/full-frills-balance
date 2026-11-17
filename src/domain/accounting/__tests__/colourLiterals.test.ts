import fs from 'node:fs';
import path from 'node:path';

/**
 * Amounts never pick `success` or `error` themselves. A money value takes its
 * colour from `signColorKey` (income, expense, text) or from a named state in
 * `statusTone`. This test flags a literal `success` or `error` colour on any
 * element that renders a formatted amount, so a new surface cannot skip the
 * policy.
 */

const SRC_ROOT = path.resolve(__dirname, '../../..');

const AMOUNT_MARKERS = /MoneyText|formatSts\(|formatMoney\(|money\(/;
const LITERAL_STATUS_COLOUR =
  /color=\{?["'](success|error)["']|color:\s*["'](success|error)["']|theme\.(success|error)\b|\?\s*["'](success|error)["']|:\s*["'](success|error)["']/;

/** Self-closing MoneyText, and AppText or ListRow.Value elements that wrap an amount. */
const ELEMENT = /<(MoneyText|AppText|ListRow\.Value)\b[\s\S]*?(\/>|<\/(AppText|ListRow\.Value)>)/g;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return ['__tests__', 'testing', 'fixtures'].includes(entry.name) ? [] : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

describe('amount colours', () => {
  it('does not pick a literal success or error colour for an amount', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      const rel = path.relative(SRC_ROOT, file).split(path.sep).join('/');
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(ELEMENT)) {
        const block = match[0];
        if (AMOUNT_MARKERS.test(block) && LITERAL_STATUS_COLOUR.test(block)) {
          const line = source.slice(0, match.index).split('\n').length;
          offenders.push(`${rel}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
