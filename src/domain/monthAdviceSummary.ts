import type { StrategyComparison } from './debtStrategies';
import { currentMonthKey, daysInMonth } from './money';
import { computeMonthTotals, type MonthPlanilla, type MonthTotals } from './monthPlanilla';
import { personalDebtProgress } from './personalDebt';
import type { ProjectionResult } from './projection';
import { lineEffectiveClp } from './sharedLineSplits';
import type { DebtRow } from '../db/schema';

export interface MonthAdviceLineItem {
  label: string;
  amountClp: number;
  yourShareClp: number;
  paid: boolean;
}

export interface MonthAdviceDebtItem {
  label: string;
  balanceClp: number;
  interestRatePercent: number;
  type: 'credit_card' | 'personal';
  installmentsPaid?: number;
  installmentsTotal?: number;
  installmentAmountClp?: number;
}

export interface MonthAdviceSummary {
  monthKey: string;
  daysLeftInMonth: number;
  incomeClp: number;
  availableClp: number;
  pendingOutflowsClp: number;
  paidSoFarClp: number;
  reserveClp: number;
  fixedItems: MonthAdviceLineItem[];
  additionalItems: MonthAdviceLineItem[];
  debts: MonthAdviceDebtItem[];
  debtStrategyRecommendation: 'snowball' | 'avalanche' | null;
  projectedShortfallClp: number;
  dailyAllowanceClp: number;
}

export function buildMonthAdviceSummary(input: {
  planilla: MonthPlanilla;
  totals: MonthTotals;
  debts: DebtRow[];
  debtComparison: StrategyComparison | null;
  projection: ProjectionResult;
  monthKey: string;
  now?: Date;
}): MonthAdviceSummary {
  const { planilla, totals, debts, debtComparison, projection, monthKey } = input;
  const splits = planilla.sharedLineSplits ?? {};

  const mapLine = (category: string, amountClp: number, paid: boolean): MonthAdviceLineItem => {
    const label = category.trim() || 'Ítem';
    return {
      label,
      amountClp,
      yourShareClp: amountClp > 0 ? lineEffectiveClp({ id: 'x', category, amountClp, paid }, splits) : 0,
      paid: !!paid,
    };
  };

  const fixedItems = planilla.fixedLines
    .filter((l) => l.amountClp > 0 || l.category.trim())
    .map((l) => mapLine(l.category, l.amountClp, !!l.paid));

  const additionalItems = planilla.additionalLines
    .filter((l) => l.amountClp > 0 || l.category.trim())
    .map((l) => mapLine(l.category, l.amountClp, !!l.paid));

  const debtItems: MonthAdviceDebtItem[] = debts
    .filter((d) => d.balance_clp > 0)
    .map((d) => {
      const progress = personalDebtProgress(d);
      return {
        label: d.name.trim() || 'Deuda',
        balanceClp: d.balance_clp,
        interestRatePercent: d.interest_rate_bps / 100,
        type: d.debt_type ?? 'credit_card',
        installmentsPaid: progress?.installmentsPaid,
        installmentsTotal: progress?.installmentsTotal,
        installmentAmountClp: d.installment_amount_clp ?? undefined,
      };
    });

  return {
    monthKey,
    daysLeftInMonth: projection.daysRemaining,
    incomeClp: planilla.incomeClp,
    availableClp: totals.availableClp,
    pendingOutflowsClp: totals.pendingOutflowsClp,
    paidSoFarClp: totals.paidSoFarClp,
    reserveClp: planilla.reserveClp,
    fixedItems,
    additionalItems,
    debts: debtItems,
    debtStrategyRecommendation: debtComparison?.recommended ?? null,
    projectedShortfallClp: projection.projectedShortfallClp,
    dailyAllowanceClp: projection.dailyAllowanceClp,
  };
}

/** Texto compacto para vista previa antes de enviar a la IA (sin historial). */
export function formatMonthAdviceSummaryPreview(summary: MonthAdviceSummary): string {
  const lines: string[] = [
    `Mes: ${summary.monthKey}`,
    `Ingresos: $${summary.incomeClp.toLocaleString('es-CL')}`,
    `Disponible: $${summary.availableClp.toLocaleString('es-CL')}`,
    `Pendiente por pagar (tu parte): $${summary.pendingOutflowsClp.toLocaleString('es-CL')}`,
    `Reserva del mes: $${summary.reserveClp.toLocaleString('es-CL')}`,
    `Días restantes del mes: ${summary.daysLeftInMonth}`,
  ];

  if (summary.fixedItems.length > 0) {
    lines.push('Gastos fijos:');
    for (const f of summary.fixedItems) {
      lines.push(
        `  - ${f.label}: $${f.yourShareClp.toLocaleString('es-CL')} (${f.paid ? 'pagado' : 'pendiente'})`,
      );
    }
  }

  if (summary.additionalItems.length > 0) {
    lines.push('Gastos adicionales:');
    for (const a of summary.additionalItems) {
      lines.push(
        `  - ${a.label}: $${a.yourShareClp.toLocaleString('es-CL')} (${a.paid ? 'pagado' : 'pendiente'})`,
      );
    }
  }

  if (summary.debts.length > 0) {
    lines.push('Deudas:');
    for (const d of summary.debts) {
      let extra = `saldo $${d.balanceClp.toLocaleString('es-CL')}`;
      if (d.interestRatePercent > 0) extra += `, ${d.interestRatePercent}% anual`;
      if (d.type === 'personal' && d.installmentsTotal != null) {
        extra += `, cuotas ${d.installmentsPaid ?? 0}/${d.installmentsTotal}`;
        if (d.installmentAmountClp) extra += `, cuota $${d.installmentAmountClp.toLocaleString('es-CL')}`;
      }
      lines.push(`  - ${d.label}: ${extra}`);
    }
    if (summary.debtStrategyRecommendation) {
      lines.push(
        `Estrategia sugerida local: ${summary.debtStrategyRecommendation === 'snowball' ? 'bola de nieve' : 'avalancha'}`,
      );
    }
  }

  if (summary.projectedShortfallClp > 0) {
    lines.push(`Riesgo de faltante proyectado: $${summary.projectedShortfallClp.toLocaleString('es-CL')}`);
  }

  return lines.join('\n');
}

export function computeAdviceBundle(input: {
  planilla: MonthPlanilla;
  debts: DebtRow[];
  debtBalances: Record<string, number>;
  debtComparison: StrategyComparison | null;
  projection: ProjectionResult;
  monthKey: string;
}): { summary: MonthAdviceSummary; totals: MonthTotals } {
  const totals = computeMonthTotals(input.planilla, input.debtBalances);
  const summary = buildMonthAdviceSummary({
    planilla: input.planilla,
    totals,
    debts: input.debts,
    debtComparison: input.debtComparison,
    projection: input.projection,
    monthKey: input.monthKey,
  });
  return { summary, totals };
}

export function daysLeftForMonthKey(monthKey: string, now = new Date()): number {
  const [year, monthNum] = monthKey.split('-').map(Number);
  const dim = daysInMonth(year, monthNum - 1);
  const day = monthKey === currentMonthKey(now) ? now.getDate() : 1;
  return Math.max(0, dim - day);
}
