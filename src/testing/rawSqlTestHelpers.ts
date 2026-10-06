export function lastRawSqlCall(
  querySpy: jest.SpyInstance,
  callIndex = -1,
): readonly [string, unknown[]] {
  const call = querySpy.mock.calls.at(callIndex)!;
  const [sql, args = []] = call;
  return [sql, args];
}

export function expectRawSqlPlaceholderArity(sql: string, args: unknown[]): void {
  expect(sql.match(/\?/g) ?? []).toHaveLength(args.length);
}

export function expectWorkplaceScopedRawSql(
  sql: string,
  args: unknown[],
  workplaceId: string,
  tablePrefixes: string[],
): void {
  for (const prefix of tablePrefixes) {
    expect(sql).toContain(`${prefix}.workplace_id = ?`);
  }
  expect(args.filter(arg => arg === workplaceId).length).toBeGreaterThanOrEqual(
    tablePrefixes.length,
  );
}
