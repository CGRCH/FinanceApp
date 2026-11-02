import { yourShareClp } from './sharedExpenses';

export const DEFAULT_FIXED_CATEGORIES = ['Alquiler', 'Tlf', 'Luz', 'Agua', 'Internet'] as const;

export interface PlanillaLine {
  id: string;
  category: string;
  amountClp: number;
  debtId?: string | null;
}

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
  householdLines: HouseholdLine[];
  householdSplitPeople: number;
}

export interface MonthTotals {
  totalFixedClp: number;
  totalAdditionalClp: number;
  fondosMenosGastosClp: number;
  householdTotalClp: number;
  householdYourShareClp: number;
  reserveClp: number;
  allOutflowsClp: number;
  surplusAfterReserveClp: number;
}

export function computeMonthTotals(planilla: MonthPlanilla): MonthTotals {
  const totalFixedClp = planilla.fixedLines.reduce((s, l) => s + l.amountClp, 0);
  const totalAdditionalClp = planilla.additionalLines.reduce((s, l) => s + l.amountClp, 0);
  const fondosMenosGastosClp = planilla.incomeClp - totalFixedClp - totalAdditionalClp;
  const householdTotalClp = planilla.householdLines.reduce((s, l) => s + l.totalClp, 0);
  const n = Math.max(1, planilla.householdSplitPeople);
  const householdYourShareClp = planilla.householdLines.reduce(
    (s, l) => s + yourShareClp(l.totalClp, n),
    0,
  );
  const allOutflowsClp = totalFixedClp + totalAdditionalClp + householdYourShareClp;
  const surplusAfterReserveClp = fondosMenosGastosClp - planilla.reserveClp - householdYourShareClp;

  return {
    totalFixedClp,
    totalAdditionalClp,
    fondosMenosGastosClp,
    householdTotalClp,
    householdYourShareClp,
    reserveClp: planilla.reserveClp,
    allOutflowsClp,
    surplusAfterReserveClp,
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
    householdLines: DEFAULT_FIXED_CATEGORIES.map((category, i) => ({
      id: `hh-${i}`,
      category,
      totalClp: 0,
    })),
    householdSplitPeople: 1,
  };
}

export function monthKeyToLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
}

export function parseSplitFromLabel(label: string): number | null {
  const match = label.match(/\/\s*(\d+)/);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return n >= 1 ? n : null;
}

/** Intenta vincular un gasto adicional con una deuda por nombre. */
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
