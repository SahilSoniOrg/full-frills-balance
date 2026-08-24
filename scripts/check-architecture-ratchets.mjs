#!/usr/bin/env node
/**
 * Ratchets three architecture debts without pretending they are already zero:
 *   - raw repository APIs / static raw SQL that omit workplace scope;
 *   - presentation and feature imports of WatermelonDB models;
 *   - direct database write/batch/action calls outside persistence seams;
 *   - service/command model preparation, update, and private raw access.
 *
 * The baseline is per rule and file. A new occurrence fails with file:line;
 * removing an occurrence makes the baseline stale and also fails until the
 * baseline is deliberately reduced.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.join(SCRIPT_DIR, '..');
const DEFAULT_BASELINE = path.join(SCRIPT_DIR, 'architecture-ratchet-baseline.json');

const SOURCE_ROOTS = ['app', 'src'];
const PRESENTATION_ROOTS = [
  'app/',
  'src/components/',
  'src/contexts/',
  'src/design-system/',
  'src/features/',
  'src/hooks/',
];
const PERSISTENCE_SEAMS = ['src/data/database/', 'src/data/models/', 'src/data/repositories/'];
const MODEL_ACCESS_SEAMS = [
  'src/data/database/',
  'src/data/models/',
  'src/data/repositories/',
  'src/services/import/',
  'src/testing/',
];
const WORKPLACE_TABLES = new Set([
  'account_metadata',
  'accounts',
  'audit_logs',
  'balance_snapshots',
  'budget_scopes',
  'budgets',
  'journal_metadata',
  'journals',
  'planned_payments',
  'transaction_auto_post_rules',
  'transaction_inbox_records',
  'transactions',
]);
const RAW_CALL_NAMES = new Set(['queryRaw', 'unsafeQueryRaw', 'unsafeSqlQuery']);
const DATABASE_WRITE_NAMES = new Set(['action', 'batch', 'write']);
const MODEL_PREPARATION_NAMES = new Set([
  'prepareCreate',
  'prepareUpdate',
  'prepareDestroy',
  'prepareDestroyPermanently',
  'prepareMarkAsDeleted',
]);
const PRIVATE_MODEL_ACCESS_NAMES = new Set(['_raw', '_setRaw']);
const RULES = [
  'unscoped_raw_query',
  'presentation_model_import',
  'direct_database_write',
  'service_model_persistence_access',
];

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT, baseline: DEFAULT_BASELINE, writeBaseline: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') args.root = path.resolve(argv[++index]);
    else if (argument === '--baseline') args.baseline = path.resolve(argv[++index]);
    else if (argument === '--write-baseline') args.writeBaseline = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return args;
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function isProductionSource(relativePath) {
  if (!/\.(?:ts|tsx)$/.test(relativePath)) return false;
  return !(
    relativePath.includes('/__tests__/') || /\.(?:test|spec)\.(?:ts|tsx)$/.test(relativePath)
  );
}

function isServiceOrCommandSource(relativePath) {
  return (
    relativePath.startsWith('src/services/') ||
    relativePath.startsWith('src/commands/') ||
    /(?:^|\/)[^/]*commands?[^/]*\.(?:ts|tsx)$/.test(relativePath)
  );
}

function isModelAccessSeam(relativePath) {
  return MODEL_ACCESS_SEAMS.some(prefix => relativePath.startsWith(prefix));
}

function collectFiles(root) {
  const files = [];
  const walk = directory => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['coverage', 'dist', 'dist-e2e', 'node_modules'].includes(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolutePath);
      else {
        const relativePath = normalizePath(path.relative(root, absolutePath));
        if (isProductionSource(relativePath)) files.push({ absolutePath, relativePath });
      }
    }
  };
  for (const sourceRoot of SOURCE_ROOTS) walk(path.join(root, sourceRoot));
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function addFinding(findings, sourceFile, file, node, rule, message) {
  findings.push({ rule, file: file.relativePath, line: lineOf(sourceFile, node), message });
}

function propertyName(expression) {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (
    ts.isElementAccessExpression(expression) &&
    expression.argumentExpression &&
    ts.isStringLiteral(expression.argumentExpression)
  ) {
    return expression.argumentExpression.text;
  }
  return null;
}

function receiverOf(expression) {
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return expression.expression;
  }
  return null;
}

function rootIdentifier(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return rootIdentifier(node.expression);
  }
  return null;
}

function isRepositoryReceiver(node) {
  const root = rootIdentifier(node);
  return Boolean(root && /repo(?:sitory)?$/i.test(root));
}

function isLikelyModelValue(node, modelValueIdentifiers) {
  const root = rootIdentifier(node);
  if (!root || isRepositoryReceiver(node)) return false;
  if (modelValueIdentifiers.has(root)) return true;

  return [
    'account',
    'budget',
    'scope',
    'journal',
    'transaction',
    'payment',
    'workplace',
    'currency',
    'snapshot',
    'metadata',
    'record',
    'model',
    'rule',
    'inbox',
    'auditlog',
    'tx',
    'pp',
  ].some(term => root.toLowerCase() === term || root.toLowerCase().endsWith(term));
}

function staticText(node, declarations) {
  if (!node) return null;
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map(span => span.literal.text)].join(' ');
  }
  if (ts.isIdentifier(node)) return declarations.get(node.text) ?? null;
  return null;
}

function referencesWorkplaceTable(sql) {
  const normalized = sql.toLowerCase();
  const tablePattern = /\b(?:from|join|into|update|delete\s+from)\s+[`"[]?([a-z_]+)/g;
  return [...normalized.matchAll(tablePattern)].some(match => WORKPLACE_TABLES.has(match[1]));
}

function isDatabaseReceiver(node, databaseIdentifiers) {
  if (!node) return false;
  if (ts.isIdentifier(node)) return databaseIdentifiers.has(node.text);
  if (ts.isPropertyAccessExpression(node)) {
    return (
      node.name.text === 'database' || isDatabaseReceiver(node.expression, databaseIdentifiers)
    );
  }
  return false;
}

function dynamicImportSpecifier(node) {
  const expression = ts.isAwaitExpression(node) ? node.expression : node;
  if (
    ts.isCallExpression(expression) &&
    expression.expression.kind === ts.SyntaxKind.ImportKeyword &&
    expression.arguments.length === 1 &&
    ts.isStringLiteral(expression.arguments[0])
  ) {
    return expression.arguments[0].text;
  }
  return null;
}

function scanFile(root, file) {
  const source = fs.readFileSync(file.absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    file.absolutePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings = [];
  const declarations = new Map();
  const databaseIdentifiers = new Set();
  const modelTypeNames = new Set();
  const modelValueIdentifiers = new Set();
  const inPresentation = PRESENTATION_ROOTS.some(prefix => file.relativePath.startsWith(prefix));
  const inPersistenceSeam = PERSISTENCE_SEAMS.some(prefix => file.relativePath.startsWith(prefix));
  const inServiceOrCommand =
    isServiceOrCommandSource(file.relativePath) && !isModelAccessSeam(file.relativePath);

  const firstPass = node => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isStringLiteralLike(node.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(node.initializer) ||
        ts.isTemplateExpression(node.initializer))
    ) {
      declarations.set(node.name.text, staticText(node.initializer, declarations));
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      /(?:^|\/)data\/database\/Database$/.test(node.moduleSpecifier.text)
    ) {
      for (const element of node.importClause?.namedBindings?.elements ?? []) {
        if ((element.propertyName ?? element.name).text === 'database') {
          databaseIdentifiers.add(element.name.text);
        }
      }
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      /(?:^|\/)data\/models(?:\/|$)/.test(node.moduleSpecifier.text)
    ) {
      const importClause = node.importClause;
      if (importClause?.name) modelTypeNames.add(importClause.name.text);
      for (const element of importClause?.namedBindings?.elements ?? []) {
        modelTypeNames.add(element.name.text);
      }
    }
    if (
      (ts.isParameter(node) || ts.isVariableDeclaration(node)) &&
      ts.isIdentifier(node.name) &&
      node.type &&
      ts.isTypeReferenceNode(node.type) &&
      ts.isIdentifier(node.type.typeName) &&
      modelTypeNames.has(node.type.typeName.text)
    ) {
      modelValueIdentifiers.add(node.name.text);
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer
    ) {
      const specifier = dynamicImportSpecifier(node.initializer);
      if (specifier && /(?:^|\/)data\/database\/Database$/.test(specifier)) {
        for (const element of node.name.elements) {
          if ((element.propertyName ?? element.name).getText(sourceFile) === 'database') {
            databaseIdentifiers.add(element.name.getText(sourceFile));
          }
        }
      }
    }
    ts.forEachChild(node, firstPass);
  };
  firstPass(sourceFile);

  const visit = node => {
    if (inServiceOrCommand && ts.isCallExpression(node)) {
      const name = propertyName(node.expression);
      const receiver = receiverOf(node.expression);
      if (
        name &&
        MODEL_PREPARATION_NAMES.has(name) &&
        receiver &&
        !isRepositoryReceiver(receiver)
      ) {
        addFinding(
          findings,
          sourceFile,
          file,
          node,
          'service_model_persistence_access',
          `model.${name}() is outside an approved persistence seam`,
        );
      } else if (
        name === 'update' &&
        receiver &&
        isLikelyModelValue(receiver, modelValueIdentifiers)
      ) {
        addFinding(
          findings,
          sourceFile,
          file,
          node,
          'service_model_persistence_access',
          'model.update() is outside an approved persistence seam',
        );
      }
    }

    if (
      inServiceOrCommand &&
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
    ) {
      const name = propertyName(node);
      if (name && PRIVATE_MODEL_ACCESS_NAMES.has(name)) {
        addFinding(
          findings,
          sourceFile,
          file,
          node,
          'service_model_persistence_access',
          `model.${name} private access is outside an approved persistence seam`,
        );
      }
    }

    if (
      inPresentation &&
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      /(?:^|\/)data\/models(?:\/|$)/.test(node.moduleSpecifier.text)
    ) {
      addFinding(
        findings,
        sourceFile,
        file,
        node,
        'presentation_model_import',
        `presentation/feature code imports WatermelonDB model ${node.moduleSpecifier.text}`,
      );
    }

    if (ts.isMethodDeclaration(node) && node.name && /Raw$/.test(node.name.getText(sourceFile))) {
      const methodName = node.name.getText(sourceFile);
      const isRawRepositoryApi =
        file.relativePath.startsWith('src/data/repositories/') && methodName !== 'queryRaw';
      const hasWorkplaceParameter = node.parameters.some(
        parameter => ts.isIdentifier(parameter.name) && parameter.name.text === 'workplaceId',
      );
      if (isRawRepositoryApi && !hasWorkplaceParameter) {
        addFinding(
          findings,
          sourceFile,
          file,
          node.name,
          'unscoped_raw_query',
          `${methodName} is a raw repository API without a workplaceId parameter`,
        );
      }
    }

    if (ts.isCallExpression(node)) {
      const name = propertyName(node.expression);
      if (name && RAW_CALL_NAMES.has(name)) {
        const sql = staticText(node.arguments[0], declarations);
        if (sql && referencesWorkplaceTable(sql) && !/\bworkplace_id\b/i.test(sql)) {
          addFinding(
            findings,
            sourceFile,
            file,
            node,
            'unscoped_raw_query',
            `${name} reads a workplace-owned table without a workplace_id predicate`,
          );
        }
      }

      if (name && DATABASE_WRITE_NAMES.has(name) && !inPersistenceSeam) {
        const receiver = receiverOf(node.expression);
        if (isDatabaseReceiver(receiver, databaseIdentifiers)) {
          addFinding(
            findings,
            sourceFile,
            file,
            node,
            'direct_database_write',
            `database.${name}() is outside an approved persistence seam`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

export function collectArchitectureFindings(root) {
  return collectFiles(root).flatMap(file => scanFile(root, file));
}

function countsByRuleAndFile(findings) {
  const counts = Object.fromEntries(RULES.map(rule => [rule, {}]));
  for (const finding of findings) {
    counts[finding.rule][finding.file] = (counts[finding.rule][finding.file] ?? 0) + 1;
  }
  return counts;
}

export function compareWithBaseline(findings, baseline) {
  const current = countsByRuleAndFile(findings);
  const failures = [];
  for (const rule of RULES) {
    const expected = baseline.rules?.[rule] ?? {};
    const files = new Set([...Object.keys(expected), ...Object.keys(current[rule])]);
    for (const file of [...files].sort()) {
      const baselineCount = expected[file] ?? 0;
      const currentCount = current[rule][file] ?? 0;
      if (currentCount > baselineCount) {
        const additions = findings
          .filter(finding => finding.rule === rule && finding.file === file)
          .slice(baselineCount);
        for (const finding of additions) {
          failures.push(`${finding.file}:${finding.line}: [${rule}] ${finding.message}`);
        }
      } else if (currentCount < baselineCount) {
        failures.push(
          `${file}: [${rule}] stale baseline ${baselineCount}; current count is ${currentCount}. Reduce the baseline so this debt cannot return.`,
        );
      }
    }
  }
  return { current, failures };
}

function baselinePayload(findings) {
  return {
    description:
      'Existing architecture debt by rule and production file. Counts may only decrease; new occurrences and stale entries fail.',
    rules: countsByRuleAndFile(findings),
  };
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const findings = collectArchitectureFindings(args.root);
  if (args.writeBaseline) {
    if (fs.existsSync(args.baseline)) {
      const existing = JSON.parse(fs.readFileSync(args.baseline, 'utf8'));
      const { failures } = compareWithBaseline(findings, existing);
      const additions = failures.filter(failure => !failure.includes('stale baseline'));
      if (additions.length > 0) {
        throw new Error(
          `Refusing to increase the architecture baseline:\n  ${additions.join('\n  ')}`,
        );
      }
    }
    fs.writeFileSync(args.baseline, `${JSON.stringify(baselinePayload(findings), null, 2)}\n`);
    console.log(`Wrote architecture ratchet baseline with ${findings.length} occurrences.`);
    return;
  }
  if (!fs.existsSync(args.baseline)) throw new Error(`Missing baseline: ${args.baseline}`);
  const baseline = JSON.parse(fs.readFileSync(args.baseline, 'utf8'));
  const { failures } = compareWithBaseline(findings, baseline);
  if (failures.length > 0) {
    console.error(`Architecture debt ratchets FAILED:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }
  const totals = countsByRuleAndFile(findings);
  const summary = RULES.map(
    rule => `${rule}=${Object.values(totals[rule]).reduce((sum, count) => sum + count, 0)}`,
  ).join(', ');
  console.log(`Architecture debt ratchets OK: ${summary}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
