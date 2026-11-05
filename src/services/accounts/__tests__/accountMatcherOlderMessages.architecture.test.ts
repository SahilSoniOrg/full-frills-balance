import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';

const pickerModules = [
  resolve(__dirname, '../accountMatcherOlderMessages.ts'),
  resolve(__dirname, '../../../features/accounts/hooks/useAccountMatcherEditorViewModel.ts'),
];
const forbiddenImport =
  /smsSyncPipeline|services\/sms-service(?:\/|$)|JournalPersistence(?:Service|Repository)|journalPersistence(?:Service|Repository)|journal.*(?:writer|write|persistence|repository)/i;

function importedModuleNames(sourceText: string): string[] {
  const source = ts.createSourceFile('picker.ts', sourceText, ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

describe('account matcher picker import boundary', () => {
  it.each(pickerModules)('%s cannot import SMS scan or journal write modules', filePath => {
    const imports = importedModuleNames(readFileSync(filePath, 'utf8'));
    expect(imports.filter(moduleName => forbiddenImport.test(moduleName))).toEqual([]);
  });
});
