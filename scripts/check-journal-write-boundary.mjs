#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY_FINANCIAL_METHODS = new Set([
  'assertBalancedIfPosted',
  'bulkCreateJournals',
  'bulkReassignTransactionAccounts',
  'bulkRestoreJournals',
  'bulkSoftDeleteJournals',
  'createReversalJournal',
  'persistReversal',
  'prepareCreateJournalWithTransactions',
  'preparePostJournalUpdates',
  'prepareRevertJournalUpdates',
  'updateJournalWithTransactions',
]);
const ALLOWED_LEGACY_REPOSITORY_CALLS = new Map([
  ['src/services/journal/bulk/bulkRename.ts', new Set(['bulkUpdateDescriptions'])],
]);

function isSource(relativePath) {
  return (
    /\.(?:ts|tsx)$/.test(relativePath) &&
    !relativePath.includes('/__tests__/') &&
    !/(?:\.test|\.spec)\.(?:ts|tsx)$/.test(relativePath) &&
    !/(?:TestHelpers)\.(?:ts|tsx)$/.test(relativePath) &&
    !relativePath.startsWith('src/testing/')
  );
}

function sourceFiles(root) {
  const files = [];
  for (const sourceRoot of ['app', 'src']) {
    const walk = directory => {
      if (!fs.existsSync(directory)) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (['coverage', 'dist', 'dist-e2e', 'node_modules'].includes(entry.name)) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(absolutePath);
        else {
          const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
          if (isSource(relativePath)) files.push({ absolutePath, relativePath });
        }
      }
    };
    walk(path.join(root, sourceRoot));
  }
  return files;
}

function propertyName(expression) {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isStringLiteral(expression.argumentExpression)
  ) {
    return expression.argumentExpression.text;
  }
  return undefined;
}

function identifierName(expression) {
  return ts.isIdentifier(expression) ? expression.text : undefined;
}

function moduleBaseName(moduleName) {
  return path.posix.basename(moduleName).replace(/\.(?:mjs|cjs|js|tsx?|jsx?)$/, '');
}

export function collectJournalWriteBoundaryFindings(root = ROOT) {
  const findings = [];
  for (const file of sourceFiles(root)) {
    const text = fs.readFileSync(file.absolutePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      file.absolutePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const allowedCalls = ALLOWED_LEGACY_REPOSITORY_CALLS.get(file.relativePath);
    const legacyRepositoryBindings = new Set(['journalWriteRepository']);
    const report = (node, message) => {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      findings.push({ file: file.relativePath, line, message });
    };

    const visit = node => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const moduleName = node.moduleSpecifier.text;
        const baseName = moduleBaseName(moduleName);
        const namedImports = node.importClause?.namedBindings;
        if (
          ['ledgerCreateService', 'ledgerUpdateService', 'ledgerLifecycleService'].includes(
            baseName,
          )
        ) {
          report(node, `Production code imports legacy journal service ${baseName}`);
        }
        if (namedImports && ts.isNamedImports(namedImports)) {
          const importedNames = new Set(
            namedImports.elements.map(element => element.propertyName?.text ?? element.name.text),
          );
          for (const element of namedImports.elements) {
            const originalName = element.propertyName?.text ?? element.name.text;
            if (originalName === 'journalWriteRepository') {
              legacyRepositoryBindings.add(element.name.text);
            }
          }
          if (
            baseName === 'journalWriteRepository' &&
            importedNames.has('journalWriteRepository') &&
            !allowedCalls
          ) {
            report(node, 'Production code imports the legacy journal write repository');
          }
          if (baseName === 'journalWriteModule' && importedNames.has('journalWriteRepository')) {
            report(node, 'Production code imports the legacy journal write repository');
          }
        } else if (
          baseName === 'journalWriteRepository' ||
          (baseName === 'journalWriteModule' && namedImports)
        ) {
          if (!allowedCalls) {
            report(node, 'Production code imports the legacy journal write repository');
          }
        }
      }

      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = propertyName(node.expression);
        const receiver = identifierName(node.expression.expression);
        if (
          receiver &&
          legacyRepositoryBindings.has(receiver) &&
          method &&
          LEGACY_FINANCIAL_METHODS.has(method)
        ) {
          report(node, `Production call uses legacy journal persistence method ${method}`);
        }
        if (
          receiver &&
          legacyRepositoryBindings.has(receiver) &&
          method &&
          allowedCalls &&
          !allowedCalls.has(method)
        ) {
          report(
            node,
            `Legacy repository call ${method} is not allowed in this maintenance command`,
          );
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function run() {
  const findings = collectJournalWriteBoundaryFindings(process.argv[2] ?? ROOT);
  if (findings.length > 0) {
    console.error('Journal write boundary guard FAILED:');
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line}: ${finding.message}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('Journal write boundary guard OK.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
