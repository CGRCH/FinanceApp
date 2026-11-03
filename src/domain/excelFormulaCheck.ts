import { emptyPlanilla, type MonthPlanilla } from './monthPlanilla';
import { computeExcelFondosMenosGastos } from './planillaBreakdown';
import type { ImportedMonth } from './xlsxGestión';

export function importedMonthToPlanillaShape(month: ImportedMonth): MonthPlanilla {
  const p = emptyPlanilla(month.monthKey);
  p.incomeClp = month.incomes.reduce((s, i) => s + i.amountClp, 0);
  p.fixedLines = month.fixedExpenses.map((f, i) => ({
    id: `imp-f-${i}`,
    category: f.category,
    amountClp: f.amountClp,
  }));
  p.additionalLines = month.additionalExpenses.map((a, i) => ({
    id: `imp-a-${i}`,
    category: a.category,
    amountClp: a.amountClp + (a.secondaryAmountClp ?? 0),
  }));
  p.reserveClp = month.reserveClp ?? 0;
  p.householdLines = (month.householdExpenses ?? []).map((h, i) => ({
    id: `imp-h-${i}`,
    category: h.category,
    totalClp: h.amountClp,
  }));
  p.householdSplitPeople = month.householdSplitPeople ?? 2;
  return p;
}

export interface ExcelFormulaCheck {
  monthKey: string;
  reserveFromSheet: number;
  fondosFromSheet: number | null;
  fondosComputedExcelStyle: number;
  fondosMatches: boolean | null;
  reserveMatches: boolean;
}

/** Compara reserva y fondos menos gastos (fórmula Excel clásica) por mes importado. */
export function compareImportedMonthToExcelFormulas(month: ImportedMonth): ExcelFormulaCheck {
  const planilla = importedMonthToPlanillaShape(month);
  const fondosComputed = computeExcelFondosMenosGastos(planilla);
  const fondosFromSheet = month.fondosMenosGastosFromSheet ?? null;
  return {
    monthKey: month.monthKey,
    reserveFromSheet: month.reserveClp ?? 0,
    fondosFromSheet,
    fondosComputedExcelStyle: fondosComputed,
    fondosMatches: fondosFromSheet === null ? null : fondosFromSheet === fondosComputed,
    reserveMatches: (month.reserveClp ?? 0) === planilla.reserveClp,
  };
}
