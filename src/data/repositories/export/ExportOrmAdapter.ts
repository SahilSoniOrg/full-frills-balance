import Model from '@nozbe/watermelondb/Model';
import { snakeToCamel } from '@/src/utils/stringUtils';

/**
 * Projects a Watermelon model into the schema-shaped row consumed by export.
 * Keep private model representation knowledge inside the data layer.
 */
export function projectOrmRow(row: Model, columnNames: readonly string[]): Record<string, unknown> {
  const source = (row._raw as unknown as Record<string, unknown>) ?? row;
  const mapped: Record<string, unknown> = {};

  for (const snake of columnNames) {
    const camel = snakeToCamel(snake);
    mapped[camel] = source[snake] !== undefined ? source[snake] : source[camel];
  }

  return mapped;
}
