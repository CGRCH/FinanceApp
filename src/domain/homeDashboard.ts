import { isDiezmoCategory } from './diezmo';
import { debtPaymentOutflowClp, type MonthPlanilla, type MonthTotals } from './monthPlanilla';
import { lineEffectiveClp } from './sharedLineSplits';
import type { DebtRow } from '../db/schema';
import type { ProjectionResult } from './projection';

export interface HomeDebtProgress {
  totalBalanceClp: number;
  paidFraction: number | null;
}

export type HomeDistributionId = 'fixed' | 'diezmo' | 'additional' | 'debt' | 'available';

export interface HomeDistributionSlice {
  id: HomeDistributionId;
  label: string;
  amountClp: number;
}

export interface UpcomingPaymentItem {
  id: string;
  label: string;
  amountClp: number;
  kind: 'fixed' | 'additional' | 'debt';
}

export interface HomeDashboardData {
  totals: MonthTotals;
  distribution: HomeDistributionSlice[];
  upcomingPayments: UpcomingPaymentItem[];
  hasDistributionData: boolean;
  projection: ProjectionResult;
  debtProgress: HomeDebtProgress;
}

export function buildHomeDistribution(planilla: MonthPlanilla, totals: MonthTotals): HomeDistributionSlice[] {
  const splits = planilla.sharedLineSplits ?? {};
  let fixedOther = 0;
  let diezmo = 0;
  for (const line of planilla.fixedLines) {
    const amt = lineEffectiveClp(line, splits);
    if (amt <= 0) continue;
    if (isDiezmoCategory(line.category)) diezmo += amt;
    else fixedOther += amt;
  }

  return [
    { id: 'fixed', label: 'Gastos fijos', amountClp: fixedOther },
    { id: 'diezmo', label: 'Diezmo', amountClp: diezmo },
    { id: 'additional', label: 'Gastos adicionales', amountClp: totals.totalAdditionalClp },
    { id: 'debt', label: 'Pagos de deudas', amountClp: totals.debtPaymentsClp },
    { id: 'available', label: 'Disponible', amountClp: Math.max(0, totals.availableClp) },
  ];
}

export function buildUpcomingPayments(
  planilla: MonthPlanilla,
  debtBalances: Record<string, number>,
  debtNames: Record<string, string>,
): UpcomingPaymentItem[] {
  const splits = planilla.sharedLineSplits ?? {};
  const items: UpcomingPaymentItem[] = [];

  for (const line of planilla.fixedLines) {
    if (line.paid) continue;
    const amt = lineEffectiveClp(line, splits);
    if (amt <= 0) continue;
    items.push({ id: line.id, label: line.category.trim() || 'Gasto fijo', amountClp: amt, kind: 'fixed' });
  }
  for (const line of planilla.additionalLines) {
    if (line.paid) continue;
    const amt = lineEffectiveClp(line, splits);
    if (amt <= 0) continue;
    items.push({ id: line.id, label: line.category.trim() || 'Adicional', amountClp: amt, kind: 'additional' });
  }
  for (const line of planilla.debtPaymentLines) {
    if (line.paid) continue;
    const balance = debtBalances[line.debtId] ?? line.amountClp;
    const amt = debtPaymentOutflowClp(line, balance);
    if (amt <= 0) continue;
    const name = debtNames[line.debtId] ?? 'Deuda';
    const cuota =
      line.installmentIndex != null && line.installmentIndex >= 1
        ? ` · cuota ${line.installmentIndex}`
        : line.paymentKind === 'full'
          ? ' · pago total'
          : '';
    items.push({
      id: line.id,
      label: `${name}${cuota}`,
      amountClp: amt,
      kind: 'debt',
    });
  }

  return items.sort((a, b) => b.amountClp - a.amountClp);
}

export function buildHomeDashboard(input: {
  planilla: MonthPlanilla;
  totals: MonthTotals;
  debtBalances: Record<string, number>;
  debtRows: DebtRow[];
  projection: ProjectionResult;
}): HomeDashboardData {
  const debtNames = Object.fromEntries(input.debtRows.map((d) => [d.id, d.name]));
  const distribution = buildHomeDistribution(input.planilla, input.totals);
  const hasDistributionData =
    input.planilla.incomeClp > 0 || distribution.some((s) => s.id !== 'available' && s.amountClp > 0);
  const { totalBalanceClp, paidFraction } = debtProgressSummary(input.debtRows);

  return {
    totals: input.totals,
    distribution,
    upcomingPayments: buildUpcomingPayments(input.planilla, input.debtBalances, debtNames),
    hasDistributionData,
    projection: input.projection,
    debtProgress: { totalBalanceClp, paidFraction },
  };
}

export function dailySpendingExplanation(totals: MonthTotals, projection: ProjectionResult): string {
  return (
    `Referencia diaria: (Disponible ${formatPlain(totals.availableClp)} − pendiente ${formatPlain(totals.pendingOutflowsClp)}) ÷ ${projection.daysRemaining} días restantes ≈ ${formatPlain(projection.dailyAllowanceClp)}. ` +
    'El pendiente incluye fijos, adicionales y pagos de deuda aún no marcados como pagados en la Planilla. ' +
    'Los ítems ya pagados ya están descontados del Disponible.'
  );
}

function formatPlain(n: number): string {
  return `$${Math.abs(n).toLocaleString('es-CL')}`;
}

export function debtProgressSummary(debtRows: DebtRow[]): { totalBalanceClp: number; paidFraction: number | null } {
  const totalBalanceClp = debtRows.reduce((s, d) => s + Math.max(0, d.balance_clp), 0);
  let original = 0;
  let remaining = 0;
  for (const d of debtRows) {
    if (d.debt_type === 'personal' && (d.total_clp ?? 0) > 0) {
      original += d.total_clp ?? 0;
      remaining += Math.max(0, d.balance_clp);
    }
  }
  if (original <= 0) return { totalBalanceClp, paidFraction: null };
  const paidFraction = Math.max(0, Math.min(1, (original - remaining) / original));
  return { totalBalanceClp, paidFraction };
}
