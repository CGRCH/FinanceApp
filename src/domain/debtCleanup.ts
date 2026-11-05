import type { MonthPlanilla } from './monthPlanilla';

export function planillaReferencesDebt(planilla: MonthPlanilla, debtId: string): boolean {
  if (planilla.debtPaymentLines.some((l) => l.debtId === debtId)) return true;
  if (planilla.fixedLines.some((l) => l.debtId === debtId)) return true;
  if (planilla.additionalLines.some((l) => l.debtId === debtId)) return true;
  return false;
}

/** Quita líneas de pago y referencias en meses abiertos; no toca meses cerrados en SQLite. */
export function removeDebtFromPlanilla(planilla: MonthPlanilla, debtId: string): MonthPlanilla {
  return {
    ...planilla,
    debtPaymentLines: planilla.debtPaymentLines.filter((l) => l.debtId !== debtId),
    fixedLines: planilla.fixedLines.map((l) =>
      l.debtId === debtId ? { ...l, debtId: null } : l,
    ),
    additionalLines: planilla.additionalLines.map((l) =>
      l.debtId === debtId ? { ...l, debtId: null } : l,
    ),
  };
}
