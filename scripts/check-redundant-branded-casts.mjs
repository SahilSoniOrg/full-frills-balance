#!/usr/bin/env node
/**
 * Fails when production code asserts a branded ID type that the expression
 * already has. Brand strings once at an untyped boundary (route params,
 * generateId, Object.keys, raw SQL, MMKV) via asJournalId / asAccountId / etc.
 *
 * Usage:
 *   node scripts/check-redundant-branded-casts.mjs
 *   node scripts/check-redundant-branded-casts.mjs --list-remaining
 */
import path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.join(SCRIPT_DIR, '..');
const BRAND_NAMES = new Set([
  'WorkplaceId',
  'AccountId',
  'JournalId',
  'TransactionId',
  'BudgetId',
  'PlannedPaymentId',
]);
const BRAND_TYPE_RE = new RegExp(
  `^(${[...BRAND_NAMES].join('|')})(\\[\\]|\\s*\\|\\s*undefined)?$`,
);

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT, listRemaining: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') args.root = path.resolve(argv[++index]);
    else if (argument === '--list-remaining') args.listRemaining = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return args;
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

export function isProductionSource(relativePath) {
  if (!/\.(?:ts|tsx)$/.test(relativePath)) return false;
  return !(
    relativePath.includes('/__tests__/') || /\.(?:test|spec)\.(?:ts|tsx)$/.test(relativePath)
  );
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isBrandAssertionType(typeNode, sourceFile) {
  const text = typeNode.getText(sourceFile).replace(/\s+/g, ' ').trim();
  return BRAND_TYPE_RE.test(text);
}

function isAnyType(type) {
  return (type.flags & ts.TypeFlags.Any) !== 0;
}

function visitAssertions(sourceFile, checker, onAssertion) {
  const visit = node => {
    if (
      (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
      isBrandAssertionType(node.type, sourceFile)
    ) {
      onAssertion(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

export function collectBrandedCastFindings(program, root) {
  const checker = program.getTypeChecker();
  const redundant = [];
  const remaining = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    const relativePath = normalizePath(path.relative(root, sourceFile.fileName));
    if (relativePath.startsWith('..')) continue;
    if (!isProductionSource(relativePath)) continue;

    visitAssertions(sourceFile, checker, node => {
      const expressionType = checker.getTypeAtLocation(node.expression);
      const assertedType = checker.getTypeFromTypeNode(node.type);
      const line = lineOf(sourceFile, node);
      const message = node.getText(sourceFile).replace(/\s+/g, ' ');
      if (!isAnyType(expressionType) && checker.isTypeAssignableTo(expressionType, assertedType)) {
        redundant.push({ file: relativePath, line, message });
        return;
      }
      remaining.push({ file: relativePath, line, message });
    });
  }

  redundant.sort((left, right) =>
    left.file === right.file ? left.line - right.line : left.file.localeCompare(right.file),
  );
  remaining.sort((left, right) =>
    left.file === right.file ? left.line - right.line : left.file.localeCompare(right.file),
  );
  return { redundant, remaining };
}

export function createProgramFromRoot(root) {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) throw new Error(`No tsconfig.json under ${root}`);
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
  );
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
}

function formatFinding(finding) {
  return `${finding.file}:${finding.line}: ${finding.message}`;
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const program = createProgramFromRoot(args.root);
  const { redundant, remaining } = collectBrandedCastFindings(program, args.root);

  if (redundant.length > 0) {
    console.error(
      `Redundant branded-ID casts FAILED (${redundant.length}):\n  ${redundant
        .map(formatFinding)
        .join('\n  ')}\nBrand once at the untyped boundary; do not recast values that are already JournalId / AccountId / …`,
    );
    process.exitCode = 1;
    return;
  }

  if (args.listRemaining) {
    console.log(
      remaining.length === 0
        ? 'No remaining production branded-ID casts.'
        : `Remaining production branded-ID casts (${remaining.length}):\n  ${remaining
            .map(formatFinding)
            .join('\n  ')}`,
    );
    return;
  }

  console.log(
    `Redundant branded-ID casts OK: 0 redundant; ${remaining.length} boundary casts remain.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
