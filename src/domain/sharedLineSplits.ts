import { yourShareClp } from './sharedExpenses';
import type { MonthPlanilla, PlanillaLine } from './monthPlanilla';

/** Divisor por ítem (≥2). Clave = id de línea fija o adicional. */
export type SharedLineSplits = Record<string, number>;

export function lineSplitDivisor(splits: SharedLineSplits, lineId: string): number | null {
  const n = splits[lineId];
  if (typeof n === 'number' && Number.isInteger(n) && n >= 2) return n;
  return null;
}

/** Monto que te afecta (tu parte si está dividido; si no, el total ingresado). */
export function lineEffectiveClp(line: PlanillaLine, splits: SharedLineSplits): number {
  if (line.amountClp <= 0) return 0;
  const div = lineSplitDivisor(splits, line.id);
  if (div) return yourShareClp(line.amountClp, div);
  return line.amountClp;
}

/** Convierte shared_line_ids + shared_split_people legacy a mapa por ítem. */
export function legacySharedToSplits(lineIds: string[], globalPeople: number): SharedLineSplits {
  const people = Math.max(2, globalPeople);
  const splits: SharedLineSplits = {};
  for (const id of lineIds) splits[id] = people;
  return splits;
}

export function normalizePlanillaSplits(planilla: MonthPlanilla): MonthPlanilla {
  const current = planilla.sharedLineSplits ?? {};
  if (Object.keys(current).length > 0) {
    return { ...planilla, sharedLineSplits: { ...current } };
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
  const ids = new Set(
    [...planilla.fixedLines, ...planilla.additionalLines].map((l) => l.id),
  );
  const next: SharedLineSplits = {};
  for (const [id, div] of Object.entries(planilla.sharedLineSplits ?? {})) {
    if (ids.has(id) && div >= 2) next[id] = div;
  }
  return next;
}
