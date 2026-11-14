import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import policy from './domain-boundary-policy.cjs';
import { isProductionSource, normalizePath, walkProductionSources } from './source-walk.mjs';

const { DOMAIN_FORBIDDEN_ROOTS, isForbiddenDomainPackage } = policy;

/** Parse syntax rather than matching comments, strings, or import-like text with a regex. */
function moduleReferences(sourceFile) {
  const references = [];
  const add = (node, argument) => {
    references.push({
      specifier: argument && ts.isStringLiteralLike(argument) ? argument.text : null,
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    });
  };
  const visit = node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node, node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference))
        add(node, node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node, node.argument.literal);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      add(node, node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

function compilerOptions(rootDir) {
  const configPath = path.join(rootDir, 'tsconfig.json');
  if (!fs.existsSync(configPath)) {
    return {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      paths: { '@/*': [path.join(rootDir, '*')] },
    };
  }
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    { ...ts.sys, readDirectory: () => [] },
    rootDir,
  );
  // TS18003 only means this options-only parse did not enumerate project inputs.
  const errors = parsed.errors.filter(error => error.code !== 18003);
  if (errors.length)
    throw new Error(
      errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'),
    );
  return parsed.options;
}

function matchesAlias(specifier, options) {
  return Object.keys(options.paths ?? {}).some(alias => {
    const star = alias.indexOf('*');
    return star < 0
      ? alias === specifier
      : specifier.startsWith(alias.slice(0, star)) && specifier.endsWith(alias.slice(star + 1));
  });
}

function packageFromFile(filename) {
  const parts = normalizePath(filename).split('/node_modules/');
  if (parts.length < 2) return null;
  const segments = parts.at(-1).split('/');
  return segments[0].startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

/**
 * Domain files cannot directly depend on forbidden ownership roots, including types.
 * Follow emitted runtime imports through local helpers/barrels to catch indirect coupling;
 * erased type dependencies in neutral DTO modules do not initialize their renderers.
 */
export function analyzeDomainBoundaries({ rootDir }) {
  rootDir = fs.realpathSync(rootDir);
  const options = compilerOptions(rootDir);
  const domainFiles = walkProductionSources(rootDir, {
    sourceRoots: ['src/domain'],
    isSource: filename =>
      isProductionSource(filename.replace(/\.[cm]?[jt]sx?$/, '.ts'), { excludeMocks: true }),
    sort: true,
  });
  const variants = [
    options.moduleSuffixes ?? [''],
    ['.ios', '.native', ''],
    ['.android', '.native', ''],
    ['.web', ''],
  ].map(moduleSuffixes => {
    const compiler = { ...options, allowJs: true, moduleSuffixes };
    return { compiler, cache: ts.createModuleResolutionCache(rootDir, value => value, compiler) };
  });
  const modules = new Map();
  const resolutions = new Map();
  const relative = filename => normalizePath(path.relative(rootDir, filename));
  const blockedPath = filename => {
    const target = relative(filename);
    return DOMAIN_FORBIDDEN_ROOTS.some(root => target === root || target.startsWith(`${root}/`));
  };
  const readModule = filename => {
    if (modules.has(filename)) return modules.get(filename);
    const source = fs.readFileSync(filename, 'utf8');
    const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    const emitted = /\.d\.[cm]?ts$/.test(filename)
      ? ''
      : ts.transpileModule(source, {
          fileName: filename,
          compilerOptions: {
            ...options,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ESNext,
            verbatimModuleSyntax: false,
            declaration: false,
            sourceMap: false,
          },
        }).outputText;
    const module = {
      direct: moduleReferences(sourceFile),
      runtime: moduleReferences(
        ts.createSourceFile(filename, emitted, ts.ScriptTarget.Latest, true),
      ),
    };
    modules.set(filename, module);
    return module;
  };
  const resolve = (filename, specifier) => {
    const key = `${filename}\0${specifier}`;
    if (resolutions.has(key)) return resolutions.get(key);
    const targets = new Set();
    for (const { compiler, cache } of variants) {
      const resolved = ts.resolveModuleName(
        specifier,
        filename,
        compiler,
        ts.sys,
        cache,
      ).resolvedModule;
      if (resolved) targets.add(fs.realpathSync(resolved.resolvedFileName));
    }
    const result = [...targets].sort();
    resolutions.set(key, result);
    return result;
  };
  const violations = new Set();
  for (const { absolutePath } of domainFiles) {
    const pending = [{ filename: absolutePath, chain: [relative(absolutePath)] }];
    const visited = new Set();
    while (pending.length) {
      const { filename, chain } = pending.shift();
      if (visited.has(filename)) continue;
      visited.add(filename);
      const module = readModule(filename);
      const directSpecifiers = new Set(module.direct.map(reference => reference.specifier));
      // Include imports injected by the compiler (for example react/jsx-runtime).
      const references =
        filename === absolutePath
          ? [
              ...module.direct,
              ...module.runtime.filter(reference => !directSpecifiers.has(reference.specifier)),
            ]
          : module.runtime;
      const runtimeSpecifiers = new Set(module.runtime.map(reference => reference.specifier));
      for (const { specifier, line } of references) {
        const chainText = [...chain, specifier ?? '<dynamic module>'].join(' -> ');
        if (!specifier) {
          violations.add(
            `${relative(absolutePath)}: dependency cannot be resolved statically: ${chainText}`,
          );
          continue;
        }
        if (isForbiddenDomainPackage(specifier)) {
          violations.add(`${relative(absolutePath)}: forbidden domain dependency: ${chainText}`);
          continue;
        }
        const targets = resolve(filename, specifier);
        if (
          !targets.length &&
          (specifier.startsWith('.') ||
            specifier.startsWith('/') ||
            matchesAlias(specifier, options))
        ) {
          violations.add(
            `${relative(filename)}:${line}: unresolved domain dependency ${specifier} (via ${chain.join(' -> ')})`,
          );
        }
        for (const target of targets) {
          const packageName = packageFromFile(target);
          const targetChain = [...chain, relative(target)];
          if (blockedPath(target) || (packageName && isForbiddenDomainPackage(packageName))) {
            violations.add(
              `${relative(absolutePath)}: forbidden domain dependency: ${targetChain.join(' -> ')}`,
            );
          } else if (
            !packageName &&
            runtimeSpecifiers.has(specifier) &&
            /\.[cm]?[jt]sx?$/.test(target) &&
            !/\.d\.[cm]?ts$/.test(target)
          ) {
            pending.push({ filename: target, chain: targetChain });
          }
        }
      }
    }
  }
  return { domainModuleCount: domainFiles.length, violations: [...violations].sort() };
}
