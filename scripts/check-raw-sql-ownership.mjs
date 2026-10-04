#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { walkProductionSources } from './lib/source-walk.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_RAW_ADAPTER_FILES = new Set([
  'src/data/database/DatabaseUtils.ts',
  'src/data/repositories/DatabaseRepository.ts',
  'src/data/repositories/raw/RawSqlExecutor.ts',
]);

function sourceFiles(root) {
  return walkProductionSources(root);
}

function moduleBaseName(moduleName) {
  return path.posix.basename(moduleName).replace(/\.(?:mjs|cjs|js|tsx?|jsx?)$/, '');
}

export function collectRawSqlOwnershipFindings(root = ROOT) {
  const findings = [];
  const removedFacadePath = 'src/data/repositories/TransactionRawRepository.ts';
  if (fs.existsSync(path.join(root, removedFacadePath))) {
    findings.push({
      file: removedFacadePath,
      line: 1,
      message: 'Removed TransactionRawRepository facade file has been restored',
    });
  }
  const report = (file, sourceFile, node, message) => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    findings.push({ file: file.relativePath, line, message });
  };

  for (const file of sourceFiles(root)) {
    const sourceFile = ts.createSourceFile(
      file.absolutePath,
      fs.readFileSync(file.absolutePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      file.relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const isApprovedAdapter = ALLOWED_RAW_ADAPTER_FILES.has(file.relativePath);

    const visit = node => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const baseName = moduleBaseName(node.moduleSpecifier.text);
        if (baseName === 'TransactionRawRepository') {
          report(file, sourceFile, node, 'Removed TransactionRawRepository facade is imported');
        }
      }

      if (
        !isApprovedAdapter &&
        ts.isCallExpression(node) &&
        (ts.isPropertyAccessExpression(node.expression) ||
          ts.isElementAccessExpression(node.expression))
      ) {
        const method = ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : ts.isStringLiteral(node.expression.argumentExpression)
            ? node.expression.argumentExpression.text
            : null;
        if (method === 'queryRaw' || method === 'unsafeQueryRaw' || method === 'unsafeSqlQuery') {
          report(file, sourceFile, node, `Direct raw SQL call ${method} bypasses RawSqlExecutor`);
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return findings.sort(
    (left, right) => left.file.localeCompare(right.file) || left.line - right.line,
  );
}

function run() {
  const findings = collectRawSqlOwnershipFindings(process.argv[2] ?? ROOT);
  if (findings.length > 0) {
    console.error('Raw SQL ownership guard FAILED:');
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line}: ${finding.message}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('Raw SQL ownership guard OK.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
