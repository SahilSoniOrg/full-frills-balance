import { jsonObject, canonicalJson, type JsonValue } from './canonicalJson';
import { INITIAL_SCHEMA_VERSION, CURRENT_ROW_SCHEMA_VERSION, type RowTable } from './rowTables';

export type RowUpgrade = (row: Readonly<Record<string, unknown>>) => Record<string, unknown>;
export type UpgradeRegistry = Readonly<
  Partial<Record<RowTable, Readonly<Record<number, RowUpgrade>>>>
>;
export type SchemaStep =
  | Readonly<{ from: number; kind: 'non-additive' }>
  | Readonly<{
      from: number;
      kind: 'additive';
      defaults?: Readonly<Partial<Record<RowTable, Readonly<Record<string, JsonValue>>>>>;
    }>;
/** Additive steps must be declared explicitly too; an absent step is never guessed. */
export const ROW_SCHEMA_STEPS: readonly SchemaStep[] = Object.freeze([]);
export const ROW_UPGRADES: UpgradeRegistry = Object.freeze({});

export function upgradeRow(
  table: RowTable,
  from: number,
  value: unknown,
  target = CURRENT_ROW_SCHEMA_VERSION as number,
  steps: readonly SchemaStep[] = ROW_SCHEMA_STEPS,
  registry: UpgradeRegistry = ROW_UPGRADES,
): Record<string, unknown> {
  if (
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(target) ||
    from < INITIAL_SCHEMA_VERSION ||
    from > target
  )
    throw new Error(`Unsupported row schema: ${from}`);
  let row = { ...jsonObject(value, 'upgrade input') };
  canonicalJson(row);
  for (let version = from; version < target; version++) {
    const matches = steps.filter(step => step.from === version);
    if (matches.length !== 1) throw new Error(`Missing or duplicate schema transition: ${version}`);
    const step = matches[0];
    const upgrade = registry[table]?.[version];
    if (step.kind === 'non-additive') {
      if (!upgrade) throw new Error(`Missing row upgrade: ${table}/${version}`);
      row = { ...jsonObject(upgrade(row), 'upgrade result') };
      canonicalJson(row);
    } else {
      if (upgrade)
        throw new Error(`Upgrade registered for additive transition: ${table}/${version}`);
      for (const [field, value] of Object.entries(step.defaults?.[table] ?? {})) {
        if (!Object.hasOwn(row, field)) row = { ...row, [field]: value };
      }
      canonicalJson(row);
    }
  }
  return row;
}
