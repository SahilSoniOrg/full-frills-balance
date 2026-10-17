import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const DATA_PREPARATION_ROOTS = [
  'src/services/sync/rowPreparation.ts',
  'src/services/sync/workplaceRowValidation.ts',
];

// Include type-only edges for forbidden target checks, but follow runtime edges only.
// Plain DTOs may describe UI values without loading their implementation.
export function importEdges(source, filename) {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const edges = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
      const bindings = clause?.namedBindings ?? node.exportClause;
      const typeOnly = Boolean(
        node.isTypeOnly ||
        clause?.isTypeOnly ||
        (bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.length &&
          !clause?.name &&
          bindings.elements.every(item => item.isTypeOnly)),
      );
      edges.push({ target: node.moduleSpecifier.text, typeOnly });
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      edges.push({ target: node.argument.literal.text, typeOnly: true });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(file) === 'require') &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      edges.push({ target: node.arguments[0].text, typeOnly: false });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      edges.push({ target: node.moduleReference.expression.text, typeOnly: node.isTypeOnly });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return edges;
}

export function resolveLocal(root, filename, target) {
  const base = target.startsWith('@/')
    ? path.join(root, target.slice(2))
    : target.startsWith('.')
      ? path.resolve(path.dirname(filename), target)
      : undefined;
  if (!base) return undefined;
  // Check mobile implementations too; a base file can conceal native initialization.
  return ['', '.native.ts', '.web.ts', '.ts', '.tsx', '/index.ts']
    .map(suffix => base + suffix)
    .filter(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

export function dataPreparationViolations(root, roots = DATA_PREPARATION_ROOTS) {
  const violations = [];
  const seen = new Set();
  const forbidden =
    /^(?:app\/|src\/(?:data\/|features\/|components\/|screens\/|services\/(?:preferences(?:\/|\.|$)|backup\/(?!keyEncoding(?:\.|$))|crypto\/(?!protocol\/))))/;
  function visit(filename, chain) {
    if (seen.has(filename)) return;
    seen.add(filename);
    for (const edge of importEdges(fs.readFileSync(filename, 'utf8'), filename)) {
      const resolved = resolveLocal(root, filename, edge.target);
      const label = [...chain, edge.target].join(' -> ');
      if (!resolved) {
        // Pure roots use local plain types and utilities, including for type-only edges.
        violations.push(`${label}: external dependency`);
        continue;
      }
      if (!resolved.length) violations.push(`${label}: unresolved local dependency`);
      for (const dependency of resolved) {
        const relative = path.relative(root, dependency).split(path.sep).join('/');
        if (forbidden.test(relative) || relative === 'src/services/sync/rowSource.ts')
          violations.push(`${label}: forbidden data preparation dependency ${relative}`);
        else if (!edge.typeOnly) visit(dependency, [...chain, relative]);
      }
    }
  }
  for (const entry of roots) visit(path.join(root, entry), [entry]);
  return violations;
}
