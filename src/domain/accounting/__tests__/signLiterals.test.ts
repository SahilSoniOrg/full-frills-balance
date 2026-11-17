import fs from 'node:fs';
import path from 'node:path';

/**
 * Keeps sign prefixes in one place. A literal `'+'`, `'-'`, `'−'`, or `'–'` next
 * to a sign-like name (`prefix`, `sign`) means a surface picked its own rule.
 * Use `signPrefix`, `bankEntrySign`, or `obligationSign` from
 * `presentationPolicy.ts` instead.
 */

const SRC_ROOT = path.resolve(__dirname, '../../..');

/** Files that may spell sign characters, each with the reason. */
const ALLOWED: Record<string, string> = {
  'domain/accounting/presentationPolicy.ts': 'the policy itself',
  'utils/currencyFormatter.ts':
    'formats a stored negative value, such as a balance, with an ASCII hyphen; signed flows use signPrefix',
  'features/setup/first-run/amountValidation.ts': 'parses a sign the user typed',
  'features/setup/first-run/spokenConfirm.ts': 'spoken confirmation text',
};

const SIGN_LITERAL = /\b(prefix|sign|Sign|Prefix)\w*\b[^\n]*['"`](\+|-|−|–)( )?['"`]/;
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return ['__tests__', 'testing', 'fixtures'].includes(entry.name) ? [] : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

describe('sign literals', () => {
  it('only the policy and the listed exceptions spell sign prefixes', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      const rel = path.relative(SRC_ROOT, file).split(path.sep).join('/');
      if (ALLOWED[rel]) continue;
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (!COMMENT_LINE.test(line) && SIGN_LITERAL.test(line)) {
            offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it('lists only exceptions that still exist', () => {
    for (const rel of Object.keys(ALLOWED)) {
      expect(fs.existsSync(path.join(SRC_ROOT, rel))).toBe(true);
    }
  });
});
