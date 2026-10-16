import path from 'node:path';
import ts from 'typescript';

/** Includes type-only imports, re-exports, import types, dynamic imports and require. */
export function cryptoImportViolations(source, relative) {
  if (!(
    relative.startsWith('src/services/crypto/') ||
    ['src/services/backup/nativeKeyApi.ts', 'src/services/backup/localKeyHierarchy.ts'].includes(
      relative,
    )
  ))
    return [];
  const file = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true);
  const violations = [];
  function inspect(node) {
    let target;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      target = node.moduleSpecifier.text;
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression)
    )
      target = node.moduleReference.expression.text;
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      target = node.argument.literal.text;
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(file) === 'require') &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      target = node.arguments[0].text;
    if (target) {
      const resolved = target.startsWith('@/')
        ? target.slice(2)
        : target.startsWith('.')
          ? path.posix.normalize(path.posix.join(path.posix.dirname(relative), target))
          : target;
      if (
        /^(?:app(?:\/|$)|src\/(?:services\/(?:sync|preferences)(?:\/|\.|$)|data\/|(?:screens|components|features)\/|types\/importContracts))/.test(
          resolved,
        )
      )
        violations.push(`${relative}: crypto imports application profile/data/UI: ${target}`);
    }
    ts.forEachChild(node, inspect);
  }
  inspect(file);
  return violations;
}

export function nativeCryptoProfileViolations(source, relative, financialTypes) {
  if (!/^modules\/expo-key-crypto\/cpp\/(?:RowCodec|RowCrypto)\.(?:cpp|hpp)$/.test(relative))
    return [];
  const literals = [...source.matchAll(/"([^"\n]*)"/g)].map(match => match[1]);
  return literals.some(value => financialTypes.includes(value)) ||
    /\b(?:TABLES|isTable)\b/.test(source)
    ? [`${relative}: handwritten financial record types in generic crypto`]
    : [];
}
