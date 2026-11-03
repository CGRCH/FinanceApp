import type { SQLiteDatabase } from 'expo-sqlite';

import type { DebtAccount } from '@/src/domain/debtStrategies';
import {
  emptyPlanilla,
  matchDebtIdForCategory,
  monthKeyToLabel,
  type MonthPlanilla,
  computeMonthTotals,
} from '@/src/domain/monthPlanilla';
import type { MonthComparePoint } from '@/src/domain/monthCompare';
import type { MonthlyLedger } from '@/src/domain/projection';
import type { ImportedDebt, ImportedMonth } from '@/src/domain/xlsxGestión';
import { yourShareClp } from '@/src/domain/sharedExpenses';
import { currentMonthKey } from '@/src/domain/money';
import { isMonthEditable } from '@/src/domain/monthEditability';

import { CREATE_STATEMENTS, type DebtRow, type ExpenseKind, type TransactionRow, type TransactionType } from './schema';

function id(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

import { migrateSchema } from './migrate';

export async function initDatabase(db: SQLiteDatabase): Promise<void> {
  for (const sql of CREATE_STATEMENTS) {
    await db.execAsync(sql);
  }
  try {
    await migrateSchema(db);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Error de migración de base local: ${message}`);
  }
}

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export async function listAllMonthKeys(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ month_key: string }>(
    `SELECT month_key FROM (
      SELECT month_key FROM month_records
      UNION
      SELECT DISTINCT month_key FROM transactions
    ) ORDER BY month_key DESC`,
  );
  return rows.map((r) => r.month_key);
}

export async function hasAnyFinanceData(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT (
      (SELECT COUNT(*) FROM month_records) +
      (SELECT COUNT(*) FROM transactions) +
      (SELECT COUNT(*) FROM debts)
    ) AS c`,
  );
  return (row?.c ?? 0) > 0;
}

export async function listTransactionsForMonth(db: SQLiteDatabase, monthKey: string): Promise<TransactionRow[]> {
  return db.getAllAsync<TransactionRow>(
    'SELECT * FROM transactions WHERE month_key = ? ORDER BY created_at ASC',
    monthKey,
  );
}

export async function deleteTransactionsForMonth(db: SQLiteDatabase, monthKey: string): Promise<void> {
  await db.runAsync('DELETE FROM transactions WHERE month_key = ?', monthKey);
}

export async function insertTransaction(
  db: SQLiteDatabase,
  input: {
    type: TransactionType;
    kind?: ExpenseKind | null;
    category: string;
    amountClp: number;
    totalAmountClp?: number;
    splitPeople?: number;
    debtId?: string | null;
    monthKey?: string;
    note?: string;
    isPaid?: boolean;
  },
): Promise<string> {
  const txId = id();
  await db.runAsync(
    `INSERT INTO transactions (id, type, kind, category, amount_clp, total_amount_clp, split_people, debt_id, month_key, note, is_paid, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    txId,
    input.type,
    input.kind ?? null,
    input.category,
    input.amountClp,
    input.totalAmountClp ?? null,
    input.splitPeople ?? null,
    input.debtId ?? null,
    input.monthKey ?? currentMonthKey(),
    input.note ?? null,
    input.isPaid ? 1 : 0,
    new Date().toISOString(),
  );
  return txId;
}

export async function loadMonthPlanilla(db: SQLiteDatabase, monthKey: string): Promise<MonthPlanilla> {
  const base = emptyPlanilla(monthKey);
  const record = await db.getFirstAsync<{
    income_clp: number;
    reserve_clp: number;
    household_split_people: number;
    shared_split_people?: number;
    shared_line_ids?: string;
  }>('SELECT * FROM month_records WHERE month_key = ?', monthKey);

  if (record) {
    base.incomeClp = record.income_clp;
    base.reserveClp = record.reserve_clp;
    base.householdSplitPeople = Math.max(1, record.household_split_people);
    base.sharedSplitPeople = Math.max(1, record.shared_split_people ?? 2);
    try {
      base.sharedSplitLineIds = JSON.parse(record.shared_line_ids ?? '[]') as string[];
    } catch {
      base.sharedSplitLineIds = [];
    }
  }

  const rows = await listTransactionsForMonth(db, monthKey);
  if (rows.length === 0 && !record) return base;

  const fixed: MonthPlanilla['fixedLines'] = [];
  const additional: MonthPlanilla['additionalLines'] = [];
  const household: MonthPlanilla['householdLines'] = [];
  const debtPaymentLines: MonthPlanilla['debtPaymentLines'] = [];

  for (const row of rows) {
    const paid = row.is_paid === 1;
    if (row.kind === 'fixed') {
      fixed.push({
        id: row.id,
        category: row.category,
        amountClp: row.amount_clp,
        debtId: row.debt_id,
        paid,
      });
    } else if (row.kind === 'additional') {
      additional.push({
        id: row.id,
        category: row.category,
        amountClp: row.amount_clp,
        debtId: row.debt_id,
        paid,
      });
    } else if (row.kind === 'household') {
      household.push({
        id: row.id,
        category: row.category,
        totalClp: row.total_amount_clp ?? row.amount_clp,
      });
    } else if (row.kind === 'debt_payment' && row.debt_id) {
      const paymentKind = row.note === 'full' ? 'full' : 'partial';
      debtPaymentLines.push({
        id: row.id,
        debtId: row.debt_id,
        paymentKind,
        amountClp: row.amount_clp,
        paid,
      });
    } else if (row.type === 'income' && !record) {
      base.incomeClp += row.amount_clp;
    }
  }

  if (fixed.length) base.fixedLines = fixed;
  if (additional.length) base.additionalLines = additional;
  if (household.length) base.householdLines = household;
  if (debtPaymentLines.length) base.debtPaymentLines = debtPaymentLines;

  return base;
}

export async function revertMonthDebtPayments(db: SQLiteDatabase, monthKey: string): Promise<void> {
  const rows = await db.getAllAsync<TransactionRow>(
    `SELECT * FROM transactions WHERE month_key = ? AND kind = 'debt_payment'`,
    monthKey,
  );
  for (const row of rows) {
    if (!row.debt_id || row.amount_clp <= 0) continue;
    await db.runAsync(
      `UPDATE debts SET balance_clp = balance_clp + ?, paid_off_at = NULL WHERE id = ?`,
      row.amount_clp,
      row.debt_id,
    );
  }
}

export async function getDebtBalances(db: SQLiteDatabase): Promise<Record<string, number>> {
  const rows = await listDebts(db);
  const map: Record<string, number> = {};
  for (const row of rows) map[row.id] = row.balance_clp;
  return map;
}

export async function applyDebtPayments(
  db: SQLiteDatabase,
  payments: { debtId: string; amountClp: number }[],
): Promise<void> {
  for (const p of payments) {
    if (p.amountClp <= 0) continue;
    await db.runAsync(
      `UPDATE debts SET
         balance_clp = CASE WHEN balance_clp - ? < 0 THEN 0 ELSE balance_clp - ? END,
         paid_off_at = CASE WHEN balance_clp - ? <= 0 THEN datetime('now') ELSE paid_off_at END
       WHERE id = ?`,
      p.amountClp,
      p.amountClp,
      p.amountClp,
      p.debtId,
    );
  }
}

export async function saveMonthPlanilla(
  db: SQLiteDatabase,
  planilla: MonthPlanilla,
  options?: { applyDebtPayments?: boolean },
): Promise<void> {
  if (!isMonthEditable(planilla.monthKey)) {
    throw new Error('Solo podés editar el mes actual. Este mes está cerrado o aún no editable.');
  }
  const monthKey = planilla.monthKey;
  const splitPeople = Math.max(1, planilla.sharedSplitPeople);

  await db.runAsync(
    `INSERT INTO month_records (month_key, income_clp, reserve_clp, household_split_people, shared_split_people, shared_line_ids, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(month_key) DO UPDATE SET
       income_clp = excluded.income_clp,
       reserve_clp = excluded.reserve_clp,
       household_split_people = excluded.household_split_people,
       shared_split_people = excluded.shared_split_people,
       shared_line_ids = excluded.shared_line_ids,
       updated_at = excluded.updated_at`,
    monthKey,
    planilla.incomeClp,
    planilla.reserveClp,
    Math.max(1, planilla.householdSplitPeople),
    splitPeople,
    JSON.stringify(planilla.sharedSplitLineIds),
    new Date().toISOString(),
  );

  if (options?.applyDebtPayments !== false) {
    await revertMonthDebtPayments(db, monthKey);
  }

  await deleteTransactionsForMonth(db, monthKey);

  const debtNames = new Map((await listDebts(db)).map((d) => [d.id, d.name]));

  for (const line of planilla.fixedLines) {
    if (line.amountClp <= 0) continue;
    await insertTransaction(db, {
      type: 'expense',
      kind: 'fixed',
      category: line.category,
      amountClp: line.amountClp,
      monthKey,
      debtId: line.debtId,
      isPaid: line.paid,
    });
  }

  for (const line of planilla.additionalLines) {
    if (line.amountClp <= 0) continue;
    await insertTransaction(db, {
      type: 'expense',
      kind: 'additional',
      category: line.category,
      amountClp: line.amountClp,
      monthKey,
      debtId: line.debtId ?? null,
      isPaid: line.paid,
    });
  }

  for (const line of planilla.householdLines) {
    if (line.totalClp <= 0) continue;
    const hn = Math.max(1, planilla.householdSplitPeople);
    const share = yourShareClp(line.totalClp, hn);
    await insertTransaction(db, {
      type: 'expense',
      kind: 'household',
      category: line.category,
      amountClp: share,
      totalAmountClp: line.totalClp,
      splitPeople: hn,
      monthKey,
    });
  }

  let resolvedPayments: { debtId: string; amountClp: number }[] = [];
  if (options?.applyDebtPayments !== false && planilla.debtPaymentLines.length > 0) {
    const balances = await getDebtBalances(db);
    const working = { ...balances };

    for (const line of planilla.debtPaymentLines) {
      const balance = working[line.debtId] ?? 0;
      if (balance <= 0) continue;

      const amount =
        line.paymentKind === 'full'
          ? balance
          : Math.max(0, Math.min(line.amountClp, balance));
      if (amount <= 0) continue;

      const name = debtNames.get(line.debtId) ?? 'Deuda';
      await insertTransaction(db, {
        type: 'expense',
        kind: 'debt_payment',
        category: `Pago ${name}`,
        amountClp: amount,
        monthKey,
        debtId: line.debtId,
        note: line.paymentKind,
        isPaid: line.paid,
      });

      resolvedPayments.push({ debtId: line.debtId, amountClp: amount });
      working[line.debtId] = balance - amount;
    }
  }

  if (options?.applyDebtPayments !== false && resolvedPayments.length > 0) {
    await applyDebtPayments(db, resolvedPayments);
  }
}

export async function buildMonthlyLedger(db: SQLiteDatabase, monthKey: string): Promise<MonthlyLedger> {
  const opening = Number.parseInt((await getSetting(db, `opening:${monthKey}`)) ?? '0', 10);
  const planilla = await loadMonthPlanilla(db, monthKey);
  const totals = computeMonthTotals(planilla);

  return {
    openingBalanceClp: opening,
    incomeClp: planilla.incomeClp,
    fixedExpensesClp: totals.totalFixedClp,
    additionalExpensesClp: totals.totalAdditionalClp + totals.debtPaymentsClp,
    sharedExpensesClp: totals.sharedYourPartClp + totals.householdYourShareClp,
    reserveClp: planilla.reserveClp,
    fondosMenosGastosClp: totals.fondosMenosGastosClp,
    allOutflowsClp: totals.allOutflowsClp,
    availableClp: totals.availableClp,
    paidSoFarClp: totals.paidSoFarClp,
    pendingOutflowsClp: totals.pendingOutflowsClp,
  };
}

export async function buildMonthCompare(db: SQLiteDatabase): Promise<MonthComparePoint[]> {
  const keys = await listAllMonthKeys(db);
  const points: MonthComparePoint[] = [];
  for (const monthKey of sortMonthKeysAsc(keys)) {
    const planilla = await loadMonthPlanilla(db, monthKey);
    const totals = computeMonthTotals(planilla);
    points.push({
      monthKey,
      label: monthKeyToLabel(monthKey),
      incomeClp: planilla.incomeClp,
      expensesClp: totals.allOutflowsClp,
      reserveClp: planilla.reserveClp,
      fondosMenosGastosClp: totals.fondosMenosGastosClp,
    });
  }
  return points;
}

function sortMonthKeysAsc(keys: string[]): string[] {
  return [...keys].sort();
}

export async function listDebts(db: SQLiteDatabase): Promise<DebtRow[]> {
  return db.getAllAsync<DebtRow>('SELECT * FROM debts ORDER BY sort_order ASC, name ASC');
}

export async function upsertDebt(
  db: SQLiteDatabase,
  debt: Omit<DebtRow, 'sort_order' | 'paid_off_at'> & { sort_order?: number; paid_off_at?: string | null },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO debts (id, name, balance_clp, minimum_payment_clp, interest_rate_bps, sort_order, paid_off_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       balance_clp = excluded.balance_clp,
       minimum_payment_clp = excluded.minimum_payment_clp,
       interest_rate_bps = excluded.interest_rate_bps,
       sort_order = excluded.sort_order,
       paid_off_at = CASE WHEN excluded.balance_clp > 0 THEN NULL ELSE COALESCE(debts.paid_off_at, excluded.paid_off_at) END`,
    debt.id,
    debt.name,
    debt.balance_clp,
    debt.minimum_payment_clp,
    debt.interest_rate_bps,
    debt.sort_order ?? 0,
    debt.paid_off_at ?? null,
  );
}

export async function deleteDebt(db: SQLiteDatabase, debtId: string): Promise<void> {
  await db.runAsync('DELETE FROM debts WHERE id = ?', debtId);
}

export function debtRowsToAccounts(rows: DebtRow[]): DebtAccount[] {
  return rows
    .filter((r) => r.balance_clp > 0)
    .map((r) => ({
      id: r.id,
      name: r.name,
      balanceClp: r.balance_clp,
      minimumPaymentClp: r.minimum_payment_clp,
      interestRateBps: r.interest_rate_bps,
    }));
}

export interface DebtPaymentHistoryRow {
  id: string;
  debt_id: string;
  month_key: string;
  amount_clp: number;
  note: string | null;
  created_at: string;
}

export async function listDebtPaymentHistory(
  db: SQLiteDatabase,
  debtId?: string,
): Promise<DebtPaymentHistoryRow[]> {
  if (debtId) {
    return db.getAllAsync<DebtPaymentHistoryRow>(
      `SELECT id, debt_id, month_key, amount_clp, note, created_at
       FROM transactions WHERE kind = 'debt_payment' AND debt_id = ?
       ORDER BY created_at DESC`,
      debtId,
    );
  }
  return db.getAllAsync<DebtPaymentHistoryRow>(
    `SELECT id, debt_id, month_key, amount_clp, note, created_at
     FROM transactions WHERE kind = 'debt_payment'
     ORDER BY created_at DESC`,
  );
}

function importedMonthToPlanilla(month: ImportedMonth): MonthPlanilla {
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
    debtId: a.debtId ?? null,
  }));
  p.reserveClp = month.reserveClp ?? 0;
  p.householdLines = (month.householdExpenses ?? []).map((h, i) => ({
    id: `imp-h-${i}`,
    category: h.category,
    totalClp: h.amountClp,
  }));
  p.householdSplitPeople = month.householdSplitPeople ?? 2;
  p.sharedSplitPeople = month.householdSplitPeople ?? 2;
  p.debtPaymentLines = [];
  const norm = (s: string) => s.trim().toLowerCase();
  for (const h of month.householdExpenses ?? []) {
    const match =
      p.fixedLines.find((f) => norm(f.category) === norm(h.category)) ??
      p.additionalLines.find((a) => norm(a.category) === norm(h.category));
    if (match && !p.sharedSplitLineIds.includes(match.id)) {
      p.sharedSplitLineIds.push(match.id);
      if (h.amountClp > 0) match.amountClp = h.amountClp;
    }
  }
  return p;
}

export async function importGestiónData(
  db: SQLiteDatabase,
  months: ImportedMonth[],
  debts: ImportedDebt[],
): Promise<{ transactions: number; debts: number }> {
  const debtRows: { id: string; name: string }[] = [];

  for (const d of debts) {
    const debtId = id();
    debtRows.push({ id: debtId, name: d.name.trim() });
    await upsertDebt(db, {
      id: debtId,
      name: d.name.trim(),
      balance_clp: d.balanceClp,
      minimum_payment_clp: Math.max(10_000, Math.round(d.balanceClp * 0.05)),
      interest_rate_bps: 1800,
    });
  }

  let txCount = 0;
  for (const month of months) {
    for (const ad of month.additionalExpenses) {
      ad.debtId = matchDebtIdForCategory(ad.category, debtRows) ?? undefined;
    }
    const planilla = importedMonthToPlanilla(month);
    await saveMonthPlanilla(db, planilla, { applyDebtPayments: false });
    const rows = await listTransactionsForMonth(db, month.monthKey);
    txCount += rows.length;
  }

  await setSetting(db, 'onboarding_done', '1');
  return { transactions: txCount, debts: debts.length };
}

export async function seedDemoData(db: SQLiteDatabase): Promise<void> {
  const month = currentMonthKey();
  const planilla: MonthPlanilla = {
    monthKey: month,
    incomeClp: 1_450_000,
    fixedLines: [
      { id: '1', category: 'Alquiler', amountClp: 420_000 },
      { id: '2', category: 'Tlf', amountClp: 18_000 },
      { id: '3', category: 'Luz', amountClp: 35_000 },
      { id: '4', category: 'Agua', amountClp: 12_000 },
      { id: '5', category: 'Internet', amountClp: 25_000 },
    ],
    additionalLines: [
      { id: 'a1', category: 'Diezmo', amountClp: 145_000 },
      { id: 'a2', category: 'Comida', amountClp: 112_000 },
    ],
    reserveClp: 80_000,
    sharedSplitLineIds: ['3', '4', '5'],
    sharedSplitPeople: 3,
    householdLines: [],
    householdSplitPeople: 1,
    debtPaymentLines: [],
  };

  await saveMonthPlanilla(db, planilla);

  await upsertDebt(db, {
    id: id(),
    name: 'Tarjeta ficticia',
    balance_clp: 680_000,
    minimum_payment_clp: 45_000,
    interest_rate_bps: 2800,
  });
  await upsertDebt(db, {
    id: id(),
    name: 'Préstamo demo',
    balance_clp: 1_200_000,
    minimum_payment_clp: 95_000,
    interest_rate_bps: 1900,
  });

  await setSetting(db, 'emergency_fund_clp', '320000');
  await setSetting(db, 'extra_debt_payment_clp', '80000');
  await setSetting(db, 'onboarding_done', '1');
}
