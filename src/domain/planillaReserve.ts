import { coerceSqliteBoolean } from './sqliteCoerce';
import {
  computeMonthTotals,
  debtPaymentOutflowClp,
  type MonthPlanilla,
} from './monthPlanilla';
import { lineEffectiveClp } from './sharedLineSplits';

/** Pagado robusto (SQLite puede devolver 0/1 como string). */
export function isLinePaidFlag(value: unknown): boolean {
  return coerceSqliteBoolean(value);
}

/** Líneas con monto comprometido (tu parte) que usan toggle Pagado. */
export function allPayableLinesMarkedPaid(
  planilla: MonthPlanilla,
  debtBalances: Record<string, number> = {},
): boolean {
  const splits = planilla.sharedLineSplits ?? {};
  let hasPayable = false;

  for (const line of [...planilla.fixedLines, ...planilla.additionalLines]) {
    const amt = lineEffectiveClp(line, splits);
    if (amt <= 0) continue;
    hasPayable = true;
    if (!isLinePaidFlag(line.paid)) return false;
  }

  for (const line of planilla.debtPaymentLines) {
    const balance = debtBalances[line.debtId] ?? line.amountClp;
    const amt = debtPaymentOutflowClp(line, balance);
    if (amt <= 0) continue;
    hasPayable = true;
    if (!isLinePaidFlag(line.paid)) return false;
  }

  return hasPayable;
}

/**
 * Reserva al cerrar el mes: lo que queda del fondo después de pagar todo (tu parte con splits).
 * null si aún hay ítems sin marcar Pagado.
 */
export function suggestedReserveClpWhenAllPaid(
  planilla: MonthPlanilla,
  debtBalances: Record<string, number> = {},
): number | null {
  if (!allPayableLinesMarkedPaid(planilla, debtBalances)) return null;
  const totals = computeMonthTotals(planilla, debtBalances);
  return Math.max(0, planilla.incomeClp - totals.allOutflowsClp);
}

/** Actualiza planilla.reserveClp cuando todo está pagado (equivale a Disponible = fondos menos gastos). */
export function applyAutoReserveToPlanilla(
  planilla: MonthPlanilla,
  debtBalances: Record<string, number> = {},
): MonthPlanilla {
  const suggested = suggestedReserveClpWhenAllPaid(planilla, debtBalances);
  if (suggested === null) return planilla;
  if (planilla.reserveClp === suggested) return planilla;
  return { ...planilla, reserveClp: suggested };
}
