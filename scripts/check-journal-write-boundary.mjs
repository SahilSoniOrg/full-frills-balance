#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REMOVED_JOURNAL_WRITE_MODULES = new Set([
  'journalWriteModule',
  'journalWriteRepository',
  'journalWriteTestHelpers',
  'ledgerCreateService',
  'ledgerLifecycleService',
  'ledgerUpdateService',
]);
const REMOVED_JOURNAL_WRITE_FILES = [
  'src/data/repositories/journal/journalWriteModule.ts',
  'src/data/repositories/journal/journalWriteRepository.ts',
  'src/data/repositories/journal/journalWriteTestHelpers.ts',
  'src/services/ledger/ledgerCreateService.ts',
  'src/services/ledger/ledgerLifecycleService.ts',
  'src/services/ledger/ledgerUpdateService.ts',
  'src/services/ledger/prepareJournalData.ts',
];

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

function moduleBaseName(moduleName) {
  return path.posix.basename(moduleName).replace(/\.(?:mjs|cjs|js|tsx?|jsx?)$/, '');
}

export function collectJournalWriteBoundaryFindings(root = ROOT) {
  const findings = [];
  for (const relativePath of REMOVED_JOURNAL_WRITE_FILES) {
    if (fs.existsSync(path.join(root, relativePath))) {
      findings.push({
        file: relativePath,
        line: 1,
        message: 'Removed journal write layer file has been restored',
      });
    }
  }
  for (const file of sourceFiles(root)) {
    const text = fs.readFileSync(file.absolutePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      file.absolutePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const report = (node, message) => {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      findings.push({ file: file.relativePath, line, message });
    };

    const visit = node => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const moduleName = node.moduleSpecifier.text;
        const baseName = moduleBaseName(moduleName);
        if (REMOVED_JOURNAL_WRITE_MODULES.has(baseName)) {
          report(node, `Production code imports removed journal write module ${baseName}`);
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
