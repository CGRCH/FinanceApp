import { yourShareClp } from './sharedExpenses';

export const DEFAULT_FIXED_CATEGORIES = ['Alquiler', 'Tlf', 'Luz', 'Agua', 'Internet'] as const;

export interface PlanillaLine {
  id: string;
  category: string;
  amountClp: number;
  debtId?: string | null;
  paid?: boolean;
}

export interface DebtPaymentLine {
  id: string;
  debtId: string;
  paymentKind: 'full' | 'partial';
  amountClp: number;
  paid?: boolean;
}

/** @deprecated Import Excel hogar; prefer sharedSplitLineIds en UI. */
export interface HouseholdLine {
  id: string;
  category: string;
  totalClp: number;
}

export interface MonthPlanilla {
  monthKey: string;
  incomeClp: number;
  fixedLines: PlanillaLine[];
  additionalLines: PlanillaLine[];
  reserveClp: number;
  /** IDs de ítems (fijos/adicionales) marcados para dividir. */
  sharedSplitLineIds: string[];
  sharedSplitPeople: number;
  householdLines: HouseholdLine[];
  householdSplitPeople: number;
  debtPaymentLines: DebtPaymentLine[];
}

export interface MonthTotals {
  /** Suma bruta de montos ingresados (sin dividir). */
  totalFixedClp: number;
  totalAdditionalClp: number;
  fondosMenosGastosClp: number;
  /** Total de cuentas seleccionadas para dividir (monto completo). */
  sharedSelectedTotalClp: number;
  /** Tu parte de las cuentas divididas. */
  sharedYourPartClp: number;
  householdTotalClp: number;
  householdYourShareClp: number;
  reserveClp: number;
  /** Gasto que te afecta este mes (con divisiones aplicadas). */
  allOutflowsClp: number;
  surplusAfterReserveClp: number;
  fundTotalClp: number;
  paidSoFarClp: number;
  availableClp: number;
  pendingOutflowsClp: number;
  debtPaymentsClp: number;
  /** Ingresos − reserva − todo lo comprometido (pagado o no). */
  afterPayingAllClp: number;
}

export function lineOutflowClp(line: PlanillaLine, sharedIds: Set<string>, people: number): number {
  if (line.amountClp <= 0) return 0;
  if (sharedIds.has(line.id)) return yourShareClp(line.amountClp, Math.max(1, people));
  return line.amountClp;
}

/** Monto ingresado en planilla (para Pagado / Disponible / Pendiente). */
export function lineEnteredClp(line: PlanillaLine): number {
  return line.amountClp > 0 ? line.amountClp : 0;
}

export function computeSharedSplitTotals(planilla: MonthPlanilla): {
  selectedTotalClp: number;
  yourPartClp: number;
} {
  const ids = new Set(planilla.sharedSplitLineIds);
  const people = Math.max(1, planilla.sharedSplitPeople);
  const lines = [...planilla.fixedLines, ...planilla.additionalLines];
  let selectedTotalClp = 0;
  let yourPartClp = 0;
  for (const line of lines) {
    if (!ids.has(line.id) || line.amountClp <= 0) continue;
    selectedTotalClp += line.amountClp;
    yourPartClp += yourShareClp(line.amountClp, people);
  }
  return { selectedTotalClp, yourPartClp };
}

export function debtPaymentOutflowClp(line: DebtPaymentLine, debtBalanceClp: number): number {
  if (line.paymentKind === 'full') return Math.max(0, debtBalanceClp);
  return Math.max(0, Math.min(line.amountClp, debtBalanceClp));
}

export function computeMonthTotals(
  planilla: MonthPlanilla,
  debtBalances: Record<string, number> = {},
): MonthTotals {
  const totalFixedClp = planilla.fixedLines.reduce((s, l) => s + l.amountClp, 0);
  const totalAdditionalClp = planilla.additionalLines.reduce((s, l) => s + l.amountClp, 0);

  let debtPaymentsClp = 0;
  for (const line of planilla.debtPaymentLines) {
    const balance = debtBalances[line.debtId] ?? line.amountClp;
    debtPaymentsClp += debtPaymentOutflowClp(line, balance);
  }

  const shared = computeSharedSplitTotals(planilla);

  const householdTotalClp = planilla.householdLines.reduce((s, l) => s + l.totalClp, 0);
  const hn = Math.max(1, planilla.householdSplitPeople);
  const householdYourShareClp = planilla.householdLines.reduce(
    (s, l) => s + yourShareClp(l.totalClp, hn),
    0,
  );

  /** Total registrado en planilla (montos ingresados + deudas + hogar), sin dividir por compartidos. */
  const allOutflowsClp =
    totalFixedClp +
    totalAdditionalClp +
    householdYourShareClp +
    debtPaymentsClp;

  let paidSoFarClp = 0;
  let pendingOutflowsClp = 0;
  for (const line of planilla.fixedLines) {
    const amt = lineEnteredClp(line);
    if (amt <= 0) continue;
    if (line.paid) paidSoFarClp += amt;
    else pendingOutflowsClp += amt;
  }
  for (const line of planilla.additionalLines) {
    const amt = lineEnteredClp(line);
    if (amt <= 0) continue;
    if (line.paid) paidSoFarClp += amt;
    else pendingOutflowsClp += amt;
  }
  for (const line of planilla.debtPaymentLines) {
    const balance = debtBalances[line.debtId] ?? line.amountClp;
    const amt = debtPaymentOutflowClp(line, balance);
    if (amt <= 0) continue;
    if (line.paid) paidSoFarClp += amt;
    else pendingOutflowsClp += amt;
  }

  const fundTotalClp = planilla.incomeClp;
  const availableClp = fundTotalClp - paidSoFarClp;
  const fondosMenosGastosClp = availableClp;
  const afterPayingAllClp = planilla.incomeClp - allOutflowsClp - planilla.reserveClp;

  return {
    totalFixedClp,
    totalAdditionalClp,
    fondosMenosGastosClp,
    sharedSelectedTotalClp: shared.selectedTotalClp,
    sharedYourPartClp: shared.yourPartClp,
    householdTotalClp,
    householdYourShareClp,
    reserveClp: planilla.reserveClp,
    allOutflowsClp,
    surplusAfterReserveClp: afterPayingAllClp,
    fundTotalClp,
    paidSoFarClp,
    availableClp,
    pendingOutflowsClp,
    debtPaymentsClp,
    afterPayingAllClp,
  };
}

export function emptyPlanilla(monthKey: string): MonthPlanilla {
  return {
    monthKey,
    incomeClp: 0,
    fixedLines: DEFAULT_FIXED_CATEGORIES.map((category, i) => ({
      id: `fixed-${i}`,
      category,
      amountClp: 0,
    })),
    additionalLines: [],
    reserveClp: 0,
    sharedSplitLineIds: [],
    sharedSplitPeople: 2,
    householdLines: [],
    householdSplitPeople: 1,
    debtPaymentLines: [],
  };
}

export function monthKeyToLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function parseSplitFromLabel(label: string): number | null {
  const match = label.match(/\/\s*(\d+)/);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return n >= 1 ? n : null;
}

export function matchDebtIdForCategory(category: string, debts: { id: string; name: string }[]): string | null {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  const cat = norm(category);
  if (!cat) return null;

  for (const d of debts) {
    const dn = norm(d.name);
    if (!dn) continue;
    if (cat.includes(dn) || dn.includes(cat)) return d.id;
    if (cat.includes('pago') && cat.includes(dn.slice(0, 4))) return d.id;
    if (cat.includes('deuda') && cat.includes(dn.slice(0, 4))) return d.id;
  }
  return null;
}

export function allEditableLines(planilla: MonthPlanilla): PlanillaLine[] {
  return [...planilla.fixedLines, ...planilla.additionalLines].filter((l) => l.amountClp > 0 || l.category.trim());
}
