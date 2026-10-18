export const usageRecords: unknown[] = [];
export async function recordTokenUsage(row: unknown) {
  usageRecords.push(row);
}
