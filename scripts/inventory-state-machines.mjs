#!/usr/bin/env node
// Discovery evidence, not a claim that syntax proves lifecycle correctness.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { DEFAULT_SKIP_DIR_NAMES, walkDirectory } from './lib/source-walk.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['src', 'app', 'modules', 'android/app/src/main', 'ios'];
const files = [];
const skipDirNames = new Set([...DEFAULT_SKIP_DIR_NAMES, 'build', 'Pods', '.git']);
roots.forEach(directory =>
  walkDirectory(
    path.join(root, directory),
    (absolute, entry) => {
      if (entry.isFile() && /\.(?:[cm]?[jt]sx?|kt|swift)$/.test(entry.name)) files.push(absolute);
    },
    { skipDirNames },
  ),
);
const inventory = files.sort().map(absolute => {
  const file = path.relative(root, absolute);
  if (/\/(?:__tests__|__mocks__|testing)\/|\.(?:test|spec)\.|\.d\.ts$/.test(file)) {
    return { file, coverage: 'EXCLUDED', reason: 'test/support/declaration; not a runtime owner' };
  }
  const source = fs.readFileSync(absolute, 'utf8');
  if (/\.(?:kt|swift)$/.test(file)) {
    return {
      file,
      coverage: 'BLOCKED',
      reason: 'native lifecycle requires semantic review',
      signals: [],
    };
  }
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const signals = [];
  const add = (node, kind, name) =>
    signals.push({
      line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
      kind,
      name,
    });
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      const call = node.initializer.expression.getText(ast).split('.').at(-1);
      if (['useState', 'useReducer', 'useRef', 'useSharedValue'].includes(call)) {
        add(node, call, node.name.getText(ast));
      }
    }
    if (ts.isVariableDeclarationList(node) && !(node.flags & ts.NodeFlags.Const)) {
      node.declarations.forEach(declaration =>
        add(declaration, 'mutable-binding', declaration.name.getText(ast)),
      );
    }
    if (
      ts.isPropertyDeclaration(node) &&
      !node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ReadonlyKeyword)
    ) {
      add(node, 'class-field', node.name.getText(ast));
    }
    if (ts.isEnumDeclaration(node)) add(node, 'enum', node.name.text);
    if (ts.isTypeAliasDeclaration(node) && ts.isUnionTypeNode(node.type)) {
      add(node, 'union', node.name.text);
    }
    if (
      ts.isNewExpression(node) &&
      ['Subject', 'BehaviorSubject', 'ReplaySubject', 'Map', 'Set', 'AbortController'].includes(
        node.expression.getText(ast),
      )
    ) {
      add(node, 'mutable-owner', node.expression.getText(ast));
    }
    if (
      ts.isCallExpression(node) &&
      ['useEffect', 'useLayoutEffect'].includes(node.expression.getText(ast).split('.').at(-1))
    ) {
      add(node, 'effect', 'lifecycle');
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return {
    file,
    coverage: 'BLOCKED',
    reason: 'syntax scanned; semantic lifecycle review required',
    signals,
  };
});

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
} else {
  const runtime = inventory.filter(item => item.coverage !== 'EXCLUDED');
  const candidates = runtime.filter(item => item.signals.length);
  const excluded = inventory.length - runtime.length;
  console.log('# State-machine discovery inventory\n');
  console.log('Generated with `node scripts/inventory-state-machines.mjs`. Do not edit by hand.\n');
  console.log(
    `Source files: ${inventory.length}. Runtime files scanned/accounted: ${runtime.length}. Test/support/declaration files excluded: ${excluded}. Files with syntax signals: ${candidates.length}.\n`,
  );
  console.log(
    'Semantic audit: **INCOMPLETE**. Signals include ordinary form fields, caches, counters and non-lifecycle unions. They are candidates, not a machine count. Absence of signals does not prove absence of a machine. Native files require separate review. `--json` lists every file and its coverage status.\n',
  );
  console.log('| Source | State/lifecycle evidence |\n| --- | --- |');
  for (const item of candidates) {
    const evidence = item.signals
      .map(
        signal =>
          `${signal.line}: ${signal.kind} ${signal.name.replaceAll('|', '\\|').replaceAll('\n', ' ')}`,
      )
      .join('; ');
    console.log(`| [${item.file}](../../${item.file}) | ${evidence} |`);
  }
  console.log('\nNative owners requiring semantic review:\n');
  runtime
    .filter(item => /\.(?:kt|swift)$/.test(item.file))
    .forEach(item => console.log(`- [${item.file}](../../${item.file})`));
}
