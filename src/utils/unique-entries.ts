/** Drops entries whose `key` was already seen (sources may repeat items within or across pages). */
export function uniqueByKey<T extends { key: string }>(
  incoming: readonly T[],
  existing: readonly T[] = [],
): T[] {
  const seen = new Set(existing.map((item) => item.key));
  const result: T[] = [];
  for (const item of incoming) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    result.push(item);
  }
  return result;
}
