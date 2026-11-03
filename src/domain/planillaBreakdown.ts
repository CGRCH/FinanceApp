import { yourShareClp } from './sharedExpenses';
import { formatClp } from './money';
import {
  computeMonthTotals,
  debtPaymentOutflowClp,
  lineEnteredClp,
  type DebtPaymentLine,
  type MonthPlanilla,
  type MonthTotals,
  type PlanillaLine,
} from './monthPlanilla';

export type BreakdownGroup = 'fixed' | 'additional' | 'household' | 'debt_payment';

export interface BreakdownRow {
  id: string;
  group: BreakdownGroup;
  label: string;
  /** Monto ingresado en planilla (Pagado / Pendiente usan el total, no la parte dividida). */
  committedClp: number;
  paid: boolean;
  note?: string;
}

export interface PlanillaBreakdown {
  incomeClp: number;
  reserveClp: number;
  rows: BreakdownRow[];
  fixedPaidClp: number;
  fixedPendingClp: number;
  additionalPaidClp: number;
  additionalPendingClp: number;
  sharedYourPartClp: number;
  householdYourShareClp: number;
  debtPaidClp: number;
  debtPendingClp: number;
  totals: MonthTotals;
  /** Ingresos − ítems pagados (= Disponible / Fondos menos gastos en la app). */
  availableClp: number;
  pendingOutflowsClp: number;
  afterPayingAllClp: number;
}

function lineRows(
  lines: PlanillaLine[],
  group: 'fixed' | 'additional',
  sharedIds: Set<string>,
  people: number,
): BreakdownRow[] {
  return lines
    .filter((l) => l.amountClp > 0 || l.category.trim())
    .map((l) => {
      const committed = lineEnteredClp(l);
      const shared = sharedIds.has(l.id) && l.amountClp > 0;
      const shareClp = shared ? yourShareClp(l.amountClp, people) : 0;
      return {
        id: l.id,
        group,
        label: l.category.trim() || 'Ítem',
        committedClp: committed,
        paid: !!l.paid,
        note: shared
          ? `tu parte: ${formatClp(shareClp)} (÷${people})`
          : undefined,
      };
    })
    .filter((r) => r.committedClp > 0);
}

function debtRows(
  lines: DebtPaymentLine[],
  debtBalances: Record<string, number>,
  debtNames: Record<string, string>,
): BreakdownRow[] {
  return lines
    .map((l) => {
      const balance = debtBalances[l.debtId] ?? l.amountClp;
      const committed = debtPaymentOutflowClp(l, balance);
      if (committed <= 0) return null;
      return {
        id: l.id,
        group: 'debt_payment' as const,
        label: debtNames[l.debtId] ?? 'Pago de deuda',
        committedClp: committed,
        paid: !!l.paid,
        note: l.paymentKind === 'full' ? 'Pago total' : 'Abono',
      };
    })
    .filter((r): r is BreakdownRow => r != null);
}

export function computePlanillaBreakdown(
  planilla: MonthPlanilla,
  debtBalances: Record<string, number> = {},
  debtNames: Record<string, string> = {},
): PlanillaBreakdown {
  const sharedIds = new Set(planilla.sharedSplitLineIds);
  const people = Math.max(1, planilla.sharedSplitPeople);
  const totals = computeMonthTotals(planilla, debtBalances);

  const fixedRows = lineRows(planilla.fixedLines, 'fixed', sharedIds, people);
  const additionalRows = lineRows(planilla.additionalLines, 'additional', sharedIds, people);

  const householdRows: BreakdownRow[] = planilla.householdLines
    .filter((h) => h.totalClp > 0)
    .map((h) => ({
      id: h.id,
      group: 'household' as const,
      label: h.category,
      committedClp: yourShareClp(h.totalClp, Math.max(1, planilla.householdSplitPeople)),
      paid: false,
      note: `Hogar ÷ ${planilla.householdSplitPeople}`,
    }));

  const debtPaymentRows = debtRows(planilla.debtPaymentLines, debtBalances, debtNames);

  const rows = [...fixedRows, ...additionalRows, ...householdRows, ...debtPaymentRows];

  const sum = (rs: BreakdownRow[], paid: boolean) =>
    rs.filter((r) => r.paid === paid).reduce((s, r) => s + r.committedClp, 0);

  return {
    incomeClp: planilla.incomeClp,
    reserveClp: planilla.reserveClp,
    rows,
    fixedPaidClp: sum(fixedRows, true),
    fixedPendingClp: sum(fixedRows, false),
    additionalPaidClp: sum(additionalRows, true),
    additionalPendingClp: sum(additionalRows, false),
    sharedYourPartClp: totals.sharedYourPartClp,
    householdYourShareClp: totals.householdYourShareClp,
    debtPaidClp: sum(debtPaymentRows, true),
    debtPendingClp: sum(debtPaymentRows, false),
    totals,
    availableClp: totals.availableClp,
    pendingOutflowsClp: totals.pendingOutflowsClp,
    afterPayingAllClp: totals.afterPayingAllClp,
  };
}

/** Fórmula clásica del Excel de César: ingresos − fijos − adicionales (bruto, sin pagos de deuda ni “pagado”). */
export function computeExcelFondosMenosGastos(planilla: MonthPlanilla): number {
  const fixed = planilla.fixedLines.reduce((s, l) => s + l.amountClp, 0);
  const additional = planilla.additionalLines.reduce((s, l) => s + l.amountClp, 0);
  return planilla.incomeClp - fixed - additional;
}
