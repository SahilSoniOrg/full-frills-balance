import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { transformFileSync } = require('@babel/core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modules = new Map();

// Compile real source with the installed Worklets plugin, independent of Jest's
// native-module mocks. Reject runtime imports outside this pure module graph.
function load(filename) {
  if (modules.has(filename)) return modules.get(filename);
  const exports = {};
  modules.set(filename, exports);
  const { code } = transformFileSync(filename, {
    caller: {
      name: 'metro',
      platform: 'android',
      isDev: false,
      supportsStaticESM: false,
      supportsDynamicImport: true,
      supportsExportNamespaceFrom: true,
    },
  });
  const localRequire = specifier => {
    if (specifier.startsWith('@babel/runtime/')) return require(specifier);
    assert.ok(specifier.startsWith('.') || specifier.startsWith('@/src/'), specifier);
    const target = specifier.startsWith('@/')
      ? path.join(root, specifier.slice(2))
      : path.resolve(path.dirname(filename), specifier);
    return load(`${target}.ts`);
  };
  new Function('exports', 'require', code)(exports, localRequire);
  return exports;
}

const { runBalanceSimulation } = load(
  path.join(root, 'src/services/simulation/balanceSimulation.ts'),
);

// Rebuild every captured function from its serialized code in a fresh realm.
// Ordinary JS functions, class instances, missing captures and RN imports fail.
function isolatedWorklet(worklet) {
  const context = vm.createContext({});
  const copies = new Map();
  function copy(value) {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value;
    if (copies.has(value)) return copies.get(value);
    if (typeof value === 'function') {
      assert.ok(value.__initData?.code, `Non-worklet captured: ${value.name}`);
      const fn = vm.runInContext(value.__initData.code, context);
      const closure = [];
      const bound = fn.bind({ __closure: closure });
      copies.set(value, bound);
      for (const [key, item] of Object.entries(value.__closure ?? [])) closure[key] = copy(item);
      return bound;
    }
    if (!Array.isArray(value)) assert.equal(Object.getPrototypeOf(value), Object.prototype);
    const result = Array.isArray(value) ? [] : {};
    copies.set(value, result);
    for (const [key, item] of Object.entries(value)) result[key] = copy(item);
    return result;
  }
  return copy(worklet);
}

function fixture(precision) {
  const flows = Array.from({ length: 120 }, (_, i) => {
    const base = {
      amount: ((i * 7919) % 8000) / 100,
      dayOffset: i % 30,
      timeframe: 'FUTURE',
      label: `flow-${i}`,
      referenceId: `flow-${i}`,
      origin: 'PLANNED_PAYMENT',
    };
    if (i % 5 === 0)
      return {
        ...base,
        kind: 'TRANSFER',
        category: 'DEBT',
        fromAccountId: 'cash',
        toAccountId: 'credit',
      };
    if (i % 7 === 0)
      return {
        ...base,
        kind: 'TRANSFER',
        category: 'TRANSFER',
        fromAccountId: 'savings',
        toAccountId: 'cash',
      };
    return i % 3 === 0
      ? { ...base, kind: 'INFLOW', category: 'INCOME', accountId: 'cash' }
      : {
          ...base,
          kind: 'OUTFLOW',
          category: 'PLANNED_EXPENSE',
          accountId: 'cash',
          meta: { allowCascade: true },
        };
  }).sort((a, b) => a.dayOffset - b.dayOffset);
  return {
    startingBalances: new Map([
      ['cash', 51.234],
      ['savings', 750.123],
      ['credit', -100.2],
    ]),
    flows,
    days: 35,
    liquidAccountIds: new Set(['cash', 'savings']),
    orderedLiquidAccountIds: ['cash', 'savings'],
    startDayOffset: 0,
    startDayTimestamp: 1793318400000,
    precision,
    majorInflowThreshold: 20,
    financialEpsilon: 0.01,
  };
}

for (const precision of [0, 2, 3]) {
  test(`compiled worklet matches local calculation with transfers, cascade and precision ${precision}`, () => {
    const input = fixture(precision);
    const before = structuredClone(input);
    const worker = isolatedWorklet(runBalanceSimulation);
    const result = structuredClone(worker(structuredClone(input)));
    assert.deepEqual(result, runBalanceSimulation(input));
    assert.deepEqual(input, before);
    assert.equal(result.projections[30].accountBalances, result.projections[31].accountBalances);
  });
}

test('worker preserves financial invariant errors instead of returning a forecast', () => {
  const worker = isolatedWorklet(runBalanceSimulation);
  const input = fixture(2);
  input.flows[0].amount = NaN;
  assert.throws(() => worker(input), /FlowInvariant.*Non-finite amount/);
  input.startingBalances.set('cash', Infinity);
  assert.throws(() => worker(input), /SimulationInputInvariant.*must be finite/);
});
