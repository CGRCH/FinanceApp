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

import { SCHEMA_VERSION, CREATE_STATEMENTS, type DebtRow, type ExpenseKind, type TransactionRow, type TransactionType } from './schema';

function id(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const ver = Number.parseInt((await getSetting(db, 'schema_version')) ?? '0', 10);
  if (ver >= SCHEMA_VERSION) return;

  await db.execAsync(`CREATE TABLE IF NOT EXISTS month_records (
    month_key TEXT PRIMARY KEY NOT NULL,
    income_clp INTEGER NOT NULL DEFAULT 0,
    reserve_clp INTEGER NOT NULL DEFAULT 0,
    household_split_people INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );`);

  try {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN debt_id TEXT');
  } catch {
    /* ya existe */
  }

  if (ver === 1) {
    await db.execAsync(`CREATE TABLE transactions_v2 (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income','expense')),
      kind TEXT CHECK(kind IN ('fixed','additional','shared','household') OR kind IS NULL),
      category TEXT NOT NULL,
      amount_clp INTEGER NOT NULL,
      total_amount_clp INTEGER,
      split_people INTEGER,
      debt_id TEXT,
      month_key TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );`);
    await db.execAsync(`
      INSERT INTO transactions_v2 (id, type, kind, category, amount_clp, total_amount_clp, split_people, month_key, note, created_at)
      SELECT id, type, kind, category, amount_clp, total_amount_clp, split_people, month_key, note, created_at FROM transactions;
    `);
    await db.execAsync('DROP TABLE transactions');
    await db.execAsync('ALTER TABLE transactions_v2 RENAME TO transactions');
  }

  await setSetting(db, 'schema_version', String(SCHEMA_VERSION));
}

export async function initDatabase(db: SQLiteDatabase): Promise<void> {
  for (const sql of CREATE_STATEMENTS) {
    await db.execAsync(sql);
  }
  await runMigrations(db);
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
  },
): Promise<string> {
  const txId = id();
  await db.runAsync(
    `INSERT INTO transactions (id, type, kind, category, amount_clp, total_amount_clp, split_people, debt_id, month_key, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  }>('SELECT * FROM month_records WHERE month_key = ?', monthKey);

  if (record) {
    base.incomeClp = record.income_clp;
    base.reserveClp = record.reserve_clp;
    base.householdSplitPeople = Math.max(1, record.household_split_people);
  }

  const rows = await listTransactionsForMonth(db, monthKey);
  if (rows.length === 0 && !record) return base;

  const fixed: MonthPlanilla['fixedLines'] = [];
  const additional: MonthPlanilla['additionalLines'] = [];
  const household: MonthPlanilla['householdLines'] = [];

  for (const row of rows) {
    if (row.kind === 'fixed') {
      fixed.push({ id: row.id, category: row.category, amountClp: row.amount_clp, debtId: row.debt_id });
    } else if (row.kind === 'additional') {
      additional.push({ id: row.id, category: row.category, amountClp: row.amount_clp, debtId: row.debt_id });
    } else if (row.kind === 'household') {
      household.push({
        id: row.id,
        category: row.category,
        totalClp: row.total_amount_clp ?? row.amount_clp,
      });
    } else if (row.type === 'income' && !record) {
      base.incomeClp += row.amount_clp;
    }
  }

  if (fixed.length) base.fixedLines = fixed;
  if (additional.length) base.additionalLines = additional;
  if (household.length) base.householdLines = household;

  return base;
}

export async function applyDebtPayments(
  db: SQLiteDatabase,
  payments: { debtId: string; amountClp: number }[],
): Promise<void> {
  for (const p of payments) {
    if (p.amountClp <= 0) continue;
    await db.runAsync(
      'UPDATE debts SET balance_clp = CASE WHEN balance_clp - ? < 0 THEN 0 ELSE balance_clp - ? END WHERE id = ?',
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
  const monthKey = planilla.monthKey;
  const n = Math.max(1, planilla.householdSplitPeople);

  await db.runAsync(
    `INSERT INTO month_records (month_key, income_clp, reserve_clp, household_split_people, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(month_key) DO UPDATE SET
       income_clp = excluded.income_clp,
       reserve_clp = excluded.reserve_clp,
       household_split_people = excluded.household_split_people,
       updated_at = excluded.updated_at`,
    monthKey,
    planilla.incomeClp,
    planilla.reserveClp,
    n,
    new Date().toISOString(),
  );

  await deleteTransactionsForMonth(db, monthKey);

  const debtPayments: { debtId: string; amountClp: number }[] = [];

  for (const line of planilla.fixedLines) {
    if (line.amountClp <= 0) continue;
    await insertTransaction(db, {
      type: 'expense',
      kind: 'fixed',
      category: line.category,
      amountClp: line.amountClp,
      monthKey,
      debtId: line.debtId,
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
    });
    if (line.debtId) {
      debtPayments.push({ debtId: line.debtId, amountClp: line.amountClp });
    }
  }

  for (const line of planilla.householdLines) {
    if (line.totalClp <= 0) continue;
    const share = yourShareClp(line.totalClp, n);
    await insertTransaction(db, {
      type: 'expense',
      kind: 'household',
      category: line.category,
      amountClp: share,
      totalAmountClp: line.totalClp,
      splitPeople: n,
      monthKey,
    });
  }

  if (options?.applyDebtPayments !== false) {
    await applyDebtPayments(db, debtPayments);
  }
}

export async function buildMonthlyLedger(db: SQLiteDatabase, monthKey: string): Promise<MonthlyLedger> {
  const opening = Number.parseInt((await getSetting(db, `opening:${monthKey}`)) ?? '0', 10);
  const record = await db.getFirstAsync<{ income_clp: number; reserve_clp: number }>(
    'SELECT income_clp, reserve_clp FROM month_records WHERE month_key = ?',
    monthKey,
  );
  const rows = await listTransactionsForMonth(db, monthKey);

  let incomeClp = record?.income_clp ?? 0;
  let fixedExpensesClp = 0;
  let additionalExpensesClp = 0;
  let sharedExpensesClp = 0;
  let householdExpensesClp = 0;
  let reserveClp = record?.reserve_clp ?? 0;

  for (const row of rows) {
    if (row.type === 'income') {
      incomeClp += row.amount_clp;
    } else if (row.kind === 'fixed') {
      fixedExpensesClp += row.amount_clp;
    } else if (row.kind === 'household') {
      householdExpensesClp += row.amount_clp;
    } else if (row.kind === 'shared') {
      sharedExpensesClp += row.amount_clp;
    } else {
      additionalExpensesClp += row.amount_clp;
    }
  }

  return {
    openingBalanceClp: opening,
    incomeClp,
    fixedExpensesClp,
    additionalExpensesClp,
    sharedExpensesClp: sharedExpensesClp + householdExpensesClp,
    reserveClp,
    fondosMenosGastosClp: incomeClp - fixedExpensesClp - additionalExpensesClp,
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
  debt: Omit<DebtRow, 'sort_order'> & { sort_order?: number },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO debts (id, name, balance_clp, minimum_payment_clp, interest_rate_bps, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       balance_clp = excluded.balance_clp,
       minimum_payment_clp = excluded.minimum_payment_clp,
       interest_rate_bps = excluded.interest_rate_bps,
       sort_order = excluded.sort_order`,
    debt.id,
    debt.name,
    debt.balance_clp,
    debt.minimum_payment_clp,
    debt.interest_rate_bps,
    debt.sort_order ?? 0,
  );
}

export async function deleteDebt(db: SQLiteDatabase, debtId: string): Promise<void> {
  await db.runAsync('DELETE FROM debts WHERE id = ?', debtId);
}

export function debtRowsToAccounts(rows: DebtRow[]): DebtAccount[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    balanceClp: r.balance_clp,
    minimumPaymentClp: r.minimum_payment_clp,
    interestRateBps: r.interest_rate_bps,
  }));
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
  p.householdSplitPeople = month.householdSplitPeople ?? 1;
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
    householdLines: [
      { id: 'h1', category: 'Alquiler', totalClp: 420_000 },
      { id: 'h2', category: 'Luz', totalClp: 35_000 },
    ],
    householdSplitPeople: 2,
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
