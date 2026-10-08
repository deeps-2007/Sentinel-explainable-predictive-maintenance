/**
 * Pick the most stable machine identifier available for a CSV row.
 * Mirrors src/data_ingestion.py:_resolve_machine_id from the original
 * Python implementation, so daily uploads keep recognizing the same
 * physical machine instead of looking like a brand-new fleet each time.
 *
 * Priority: explicit `machine_id` column > `Product ID` > position-based
 * fallback (`<Type>-<row number>`).
 */
export function resolveMachineId(row, position) {
  const machineId = row.machine_id;
  if (machineId !== undefined && machineId !== null && String(machineId).trim() !== "") {
    return String(machineId).trim();
  }

  const productId = row["Product ID"];
  if (productId !== undefined && productId !== null && String(productId).trim() !== "") {
    return String(productId).trim();
  }

  const type = String(row.Type || "X").toUpperCase();
  return `${type}-${String(position).padStart(4, "0")}`;
}
