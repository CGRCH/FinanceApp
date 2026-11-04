import { coerceClpAmount, coerceSplitDivisor } from './sqliteCoerce';
import { yourShareClp } from './sharedExpenses';
import type { MonthPlanilla, PlanillaLine } from './monthPlanilla';

/** Divisor por ítem (≥2). Clave = id de línea fija o adicional. */
export type SharedLineSplits = Record<string, number>;

export function parseSplitDivisor(value: unknown): number | null {
  return coerceSplitDivisor(value);
}

export function lineSplitDivisor(splits: SharedLineSplits, lineId: string): number | null {
  return parseSplitDivisor(splits[lineId]);
}

export function normalizeSharedLineSplits(raw: Record<string, unknown> | SharedLineSplits | undefined): SharedLineSplits {
  if (!raw) return {};
  const next: SharedLineSplits = {};
  for (const [id, value] of Object.entries(raw)) {
    const div = parseSplitDivisor(value);
    if (div != null) next[id] = div;
  }
  return next;
}

/** Monto que te afecta (tu parte si está dividido; si no, el total ingresado). */
export function lineEffectiveClp(line: PlanillaLine, splits: SharedLineSplits): number {
  const amount = coerceClpAmount(line.amountClp);
  if (amount <= 0) return 0;
  const div = lineSplitDivisor(splits, line.id);
  if (div) return yourShareClp(amount, div);
  return amount;
}

export function legacySharedToSplits(lineIds: string[], globalPeople: number): SharedLineSplits {
  const people = Math.max(2, coerceSplitDivisor(globalPeople) ?? 2);
  const splits: SharedLineSplits = {};
  for (const id of lineIds) splits[id] = people;
  return splits;
}

export function normalizePlanillaSplits(planilla: MonthPlanilla): MonthPlanilla {
  const current = normalizeSharedLineSplits(planilla.sharedLineSplits);
  if (Object.keys(current).length > 0) {
    return { ...planilla, sharedLineSplits: current };
  }
  const legacyIds = planilla.sharedSplitLineIds ?? [];
  if (legacyIds.length === 0) {
    return { ...planilla, sharedLineSplits: {} };
  }
  return {
    ...planilla,
    sharedLineSplits: legacySharedToSplits(legacyIds, planilla.sharedSplitPeople ?? 2),
  };
}

export function pruneSplitsForLines(planilla: MonthPlanilla): SharedLineSplits {
  const ids = new Set([...planilla.fixedLines, ...planilla.additionalLines].map((l) => l.id));
  const next: SharedLineSplits = {};
  for (const [id, div] of Object.entries(normalizeSharedLineSplits(planilla.sharedLineSplits))) {
    if (ids.has(id)) next[id] = div;
  }
  return next;
}

/** Reconstruye divisores desde filas de transacción (ids estables tras guardar). */
export function splitsFromTransactionRows(
  rows: { id: string; kind: string | null; split_people: unknown }[],
): SharedLineSplits {
  const splits: SharedLineSplits = {};
  for (const row of rows) {
    if (row.kind !== 'fixed' && row.kind !== 'additional') continue;
    const div = parseSplitDivisor(row.split_people);
    if (div != null) splits[row.id] = div;
  }
  return splits;
}

export function mergeSplitMaps(stored: SharedLineSplits, fromRows: SharedLineSplits): SharedLineSplits {
  return { ...normalizeSharedLineSplits(stored), ...fromRows };
}
