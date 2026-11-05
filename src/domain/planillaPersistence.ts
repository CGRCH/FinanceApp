import { encodeDebtPaymentNote } from './debtInstallments';
import type { DebtPaymentLine, MonthPlanilla, PlanillaLine } from './monthPlanilla';
import { newPlanillaLineId } from './planillaLineId';
import { matchDebtIdForCategory } from './monthPlanilla';
import { lineSplitDivisor, pruneSplitsForLines, type SharedLineSplits } from './sharedLineSplits';
import { yourShareClp } from './sharedExpenses';
import type { ExpenseKind } from '@/src/db/schema';

export function shouldPersistExpenseLine(line: PlanillaLine, splits: SharedLineSplits): boolean {
  if (line.amountClp > 0) return true;
  if (line.category.trim().length > 0) return true;
  const div = lineSplitDivisor(splits, line.id);
  return div != null && div >= 2;
}

export function ensurePlanillaLineIds(planilla: MonthPlanilla): MonthPlanilla {
  let changed = false;
  const fix = (line: PlanillaLine, scope: 'fixed' | 'additional'): PlanillaLine => {
    if (line.id?.trim()) return line;
    changed = true;
    return { ...line, id: newPlanillaLineId(scope) };
  };
  const fixedLines = planilla.fixedLines.map((l) => fix(l, 'fixed'));
  const additionalLines = planilla.additionalLines.map((l) => fix(l, 'additional'));
  const debtPaymentLines = planilla.debtPaymentLines.map((l) => {
    if (l.id?.trim()) return l;
    changed = true;
    return { ...l, id: newPlanillaLineId('debt') };
  });
  const householdLines = planilla.householdLines.map((l) => {
    if (l.id?.trim()) return l;
    changed = true;
    return { ...l, id: newPlanillaLineId('household') };
  });
  if (!changed) return planilla;
  return { ...planilla, fixedLines, additionalLines, debtPaymentLines, householdLines };
}

export function linkPlanillaDebtCategories(
  planilla: MonthPlanilla,
  debts: { id: string; name: string }[],
): MonthPlanilla {
  return {
    ...planilla,
    additionalLines: planilla.additionalLines.map((l) => ({
      ...l,
      debtId: matchDebtIdForCategory(l.category, debts) ?? l.debtId ?? null,
    })),
  };
}

export interface TransactionWriteSpec {
  id: string;
  type: 'expense';
  kind: ExpenseKind;
  category: string;
  amountClp: number;
  totalAmountClp?: number;
  splitPeople?: number;
  debtId?: string | null;
  monthKey: string;
  note?: string;
  isPaid?: boolean;
}

function expenseWriteFromLine(
  line: PlanillaLine,
  kind: 'fixed' | 'additional',
  splits: SharedLineSplits,
  monthKey: string,
): TransactionWriteSpec | null {
  if (!shouldPersistExpenseLine(line, splits)) return null;
  const div = lineSplitDivisor(splits, line.id);
  return {
    id: line.id,
    type: 'expense',
    kind,
    category: line.category,
    amountClp: line.amountClp,
    totalAmountClp: div && div >= 2 ? line.amountClp : undefined,
    splitPeople: div && div >= 2 ? div : undefined,
    monthKey,
    debtId: line.debtId ?? null,
    isPaid: line.paid,
  };
}

/** Especificaciones de transacciones del mes (ids estables = ids de línea). */
export function buildMonthTransactionWrites(
  planilla: MonthPlanilla,
  options: {
    debtNames: Map<string, string>;
    debtBalances: Record<string, number>;
    applyDebtPayments: boolean;
  },
): TransactionWriteSpec[] {
  const withIds = ensurePlanillaLineIds(planilla);
  const splits = pruneSplitsForLines(withIds);
  const monthKey = withIds.monthKey;
  const writes: TransactionWriteSpec[] = [];

  for (const line of withIds.fixedLines) {
    const w = expenseWriteFromLine(line, 'fixed', splits, monthKey);
    if (w) writes.push(w);
  }
  for (const line of withIds.additionalLines) {
    const w = expenseWriteFromLine(line, 'additional', splits, monthKey);
    if (w) writes.push(w);
  }

  for (const line of withIds.householdLines) {
    if (line.totalClp <= 0) continue;
    const hn = Math.max(1, withIds.householdSplitPeople);
    const share = yourShareClp(line.totalClp, hn);
    writes.push({
      id: line.id,
      type: 'expense',
      kind: 'household',
      category: line.category,
      amountClp: share,
      totalAmountClp: line.totalClp,
      splitPeople: hn,
      monthKey,
    });
  }

  if (options.applyDebtPayments) {
    const working = { ...options.debtBalances };
    for (const line of withIds.debtPaymentLines) {
      const balance = working[line.debtId] ?? 0;
      if (balance <= 0) continue;
      const amount =
        line.paymentKind === 'full' ? balance : Math.max(0, Math.min(line.amountClp, balance));
      if (amount <= 0) continue;
      const name = options.debtNames.get(line.debtId) ?? 'Deuda';
      const cuotaLabel =
        line.installmentIndex != null && line.installmentIndex >= 1
          ? ` · Cuota ${line.installmentIndex}`
          : '';
      writes.push({
        id: line.id,
        type: 'expense',
        kind: 'debt_payment',
        category: `Pago ${name}${cuotaLabel}`,
        amountClp: amount,
        monthKey,
        debtId: line.debtId,
        note: encodeDebtPaymentNote(line),
        isPaid: line.paid,
      });
      if (line.paid) {
        working[line.debtId] = balance - amount;
      }
    }
  }

  return writes;
}

/** Simula recarga de líneas adicionales + splits desde escrituras (regresión save/reload). */
export function planillaSplitsAfterTransactionSync(
  planilla: MonthPlanilla,
  writes: TransactionWriteSpec[],
  storedSplits: SharedLineSplits,
): Pick<MonthPlanilla, 'additionalLines' | 'sharedLineSplits'> {
  const additionalLines = writes
    .filter((w) => w.kind === 'additional')
    .map((w) => ({
      id: w.id,
      category: w.category,
      amountClp: w.amountClp,
      debtId: w.debtId ?? null,
      paid: w.isPaid,
    }));
  const fromRows = writes
    .filter((w) => w.kind === 'fixed' || w.kind === 'additional')
    .reduce<SharedLineSplits>((acc, w) => {
      if (w.splitPeople != null && w.splitPeople >= 2) acc[w.id] = w.splitPeople;
      return acc;
    }, {});
  const sharedLineSplits = { ...storedSplits, ...fromRows };
  return {
    additionalLines,
    sharedLineSplits: pruneSplitsForLines({ ...planilla, additionalLines, sharedLineSplits }),
  };
}
