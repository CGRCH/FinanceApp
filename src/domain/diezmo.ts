import { isMonthEditable } from './monthEditability';
import { formatClp } from './money';
import type { MonthPlanilla } from './monthPlanilla';

export function isDiezmoCategory(category: string): boolean {
  return category.trim().toLowerCase() === 'diezmo';
}

/** Diezmo = 10% de ingresos del mes, redondeo entero CLP. */
export function diezmoAmountFromIncomeClp(incomeClp: number): number {
  if (!Number.isFinite(incomeClp) || incomeClp <= 0) return 0;
  return Math.round(incomeClp * 0.1);
}

export function diezmoHintLabel(incomeClp: number): string {
  return `10% de ${formatClp(incomeClp)}`;
}

export function applyDiezmoToPlanilla(planilla: MonthPlanilla): MonthPlanilla {
  const amount = diezmoAmountFromIncomeClp(planilla.incomeClp);
  let changed = false;
  const fixedLines = planilla.fixedLines.map((line) => {
    if (!isDiezmoCategory(line.category)) return line;
    if (line.amountClp === amount) return line;
    changed = true;
    return { ...line, amountClp: amount };
  });
  return changed ? { ...planilla, fixedLines } : planilla;
}

/** Solo recalcula Diezmo en el mes calendario editable (actual). */
export function applyDiezmoForMonth(
  planilla: MonthPlanilla,
  monthKey: string,
  now = new Date(),
): MonthPlanilla {
  if (!isMonthEditable(monthKey, now)) return planilla;
  return applyDiezmoToPlanilla(planilla);
}
