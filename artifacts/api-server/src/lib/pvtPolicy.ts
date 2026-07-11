export function normalizePvtGrantAmount(value: number): number {
  if (!Number.isFinite(value)) throw new Error("PVT grant amount must be finite");
  const amount = Math.trunc(value);
  if (amount < 0) throw new Error("negative PVT grants are not allowed");
  return amount;
}
