import type { Sheet } from "../model/types";

export const COMPOSITIONS = [
  { count: 2, label: "Два рядом" },
  { count: 3, label: "Один высокий и два рядом" },
  { count: 4, label: "Четыре окна" },
  { count: 5, label: "Два, широкий посередине, два" },
  { count: 6, label: "Шесть окон" },
] as const;

/** Keep valid slots in place; fill newly opened slots without duplicating a sheet. */
export function reconcileSpread(ids: string[], sheets: Sheet[], count: number): string[] {
  const valid = new Set(sheets.map((s) => s.id));
  return [...new Set([...ids.filter((id) => valid.has(id)), ...sheets.map((s) => s.id)])].slice(0, Math.min(count, sheets.length));
}

/** Selecting an already visible sheet swaps its slot instead of creating a duplicate. */
export function replaceSpreadSlot(ids: string[], slot: number, id: string): string[] {
  if (slot < 0 || slot >= ids.length) return ids;
  const next = [...ids], other = next.indexOf(id);
  if (other >= 0) next[other] = next[slot];
  next[slot] = id;
  return next;
}

export function compositionStyle(count: number, ratio: number) {
  const r = Math.max(35, Math.min(65, ratio));
  if (count === 3) return { gridTemplateAreas: '"a b" "a c"', gridTemplateColumns: `${r}fr ${100-r}fr`, gridTemplateRows: "1fr 1fr" };
  if (count === 4) return { gridTemplateAreas: '"a b" "c d"', gridTemplateColumns: "1fr 1fr", gridTemplateRows: `${r}fr ${100-r}fr` };
  if (count === 5) return { gridTemplateAreas: '"b c" "a a" "d e"', gridTemplateColumns: "1fr 1fr", gridTemplateRows: `${(100-r)/2}fr ${r}fr ${(100-r)/2}fr` };
  if (count === 6) return { gridTemplateAreas: '"a b c" "d e f"', gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: `${r}fr ${100-r}fr` };
  if (count === 1) return { gridTemplateAreas: '"a"', gridTemplateColumns: "1fr", gridTemplateRows: "1fr" };
  return { gridTemplateAreas: '"a b"', gridTemplateColumns: `${r}fr ${100-r}fr`, gridTemplateRows: "1fr" };
}
