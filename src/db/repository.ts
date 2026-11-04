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
import { normalizePlanillaSplits, pruneSplitsForLines, splitsFromTransactionRows, mergeSplitMaps, normalizeSharedLineSplits } from '@/src/domain/sharedLineSplits';
import { coerceClpAmount, coerceSqliteBoolean, coerceSqliteInteger } from '@/src/domain/sqliteCoerce';
import { decodeDebtPaymentNote, type InstallmentPaymentRecord } from '@/src/domain/debtInstallments';
import { currentMonthKey } from '@/src/domain/money';
import { removeDebtFromPlanilla, planillaReferencesDebt } from '@/src/domain/debtCleanup';
import { applyDiezmoForMonth } from '@/src/domain/diezmo';
import { isMonthEditable, monthEditability } from '@/src/domain/monthEditability';
import {
  applyFixedTemplateToPlanilla,
  canApplyTemplateToMonth,
  DEFAULT_FIXED_EXPENSE_TEMPLATE,
  FIXED_TEMPLATE_SETTING_KEY,
  parseFixedExpenseTemplate,
  serializeFixedExpenseTemplate,
  type FixedExpenseTemplate,
} from '@/src/domain/fixedExpenseTemplate';
import { buildMonthTransactionWrites, ensurePlanillaLineIds } from '@/src/domain/planillaPersistence';

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
    await ensureFixedExpenseTemplateMigrated(db);
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
    id?: string;
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
  const txId = input.id ?? id();
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

export async function upsertTransaction(
  db: SQLiteDatabase,
  input: {
    id: string;
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
  const txId = input.id;
  const createdAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO transactions (id, type, kind, category, amount_clp, total_amount_clp, split_people, debt_id, month_key, note, is_paid, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       type = excluded.type,
       kind = excluded.kind,
       category = excluded.category,
       amount_clp = excluded.amount_clp,
       total_amount_clp = excluded.total_amount_clp,
       split_people = excluded.split_people,
       debt_id = excluded.debt_id,
       month_key = excluded.month_key,
       note = excluded.note,
       is_paid = excluded.is_paid`,
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
    createdAt,
  );
  return txId;
}

async function syncMonthTransactions(
  db: SQLiteDatabase,
  planilla: MonthPlanilla,
  options: { applyDebtPayments: boolean },
): Promise<{ debtId: string; amountClp: number }[]> {
  const monthKey = planilla.monthKey;
  const debtNames = new Map((await listDebts(db)).map((d) => [d.id, d.name]));
  const debtBalances = await getDebtBalances(db);
  const writes = buildMonthTransactionWrites(planilla, {
    debtNames,
    debtBalances,
    applyDebtPayments: options.applyDebtPayments,
  });
  const desiredIds = new Set(writes.map((w) => w.id));
  const existing = await listTransactionsForMonth(db, monthKey);
  for (const row of existing) {
    if (!desiredIds.has(row.id)) {
      await db.runAsync('DELETE FROM transactions WHERE id = ?', row.id);
    }
  }
  for (const w of writes) {
    await upsertTransaction(db, w);
  }

  const resolvedPayments: { debtId: string; amountClp: number }[] = [];
  if (options.applyDebtPayments) {
    const working = { ...debtBalances };
    for (const line of planilla.debtPaymentLines) {
      if (!line.paid) continue;
      const balance = working[line.debtId] ?? 0;
      if (balance <= 0) continue;
      const amount =
        line.paymentKind === 'full' ? balance : Math.max(0, Math.min(line.amountClp, balance));
      if (amount <= 0) continue;
      resolvedPayments.push({ debtId: line.debtId, amountClp: amount });
      working[line.debtId] = balance - amount;
    }
  }
  return resolvedPayments;
}

export async function loadMonthPlanillaRaw(db: SQLiteDatabase, monthKey: string): Promise<MonthPlanilla> {
  const base = emptyPlanilla(monthKey);
  const record = await db.getFirstAsync<{
    income_clp: number;
    reserve_clp: number;
    household_split_people: number;
    shared_split_people?: number;
    shared_line_ids?: string;
    shared_line_splits?: string;
  }>('SELECT * FROM month_records WHERE month_key = ?', monthKey);

  if (record) {
    base.incomeClp = coerceSqliteInteger(record.income_clp);
    base.reserveClp = coerceSqliteInteger(record.reserve_clp);
    base.householdSplitPeople = Math.max(1, coerceSqliteInteger(record.household_split_people, 1));
    base.sharedSplitPeople = Math.max(2, coerceSqliteInteger(record.shared_split_people, 2));
    try {
      base.sharedSplitLineIds = JSON.parse(record.shared_line_ids ?? '[]') as string[];
    } catch {
      base.sharedSplitLineIds = [];
    }
    try {
      const parsed = JSON.parse(record.shared_line_splits ?? '{}') as Record<string, unknown>;
      base.sharedLineSplits = normalizeSharedLineSplits(parsed);
    } catch {
      base.sharedLineSplits = {};
    }
  }

  const rows = await listTransactionsForMonth(db, monthKey);
  const splitsFromRows = splitsFromTransactionRows(rows);
  if (Object.keys(splitsFromRows).length > 0) {
    base.sharedLineSplits = mergeSplitMaps(base.sharedLineSplits ?? {}, splitsFromRows);
  }
  if (rows.length === 0 && !record) return base;

  const fixed: MonthPlanilla['fixedLines'] = [];
  const additional: MonthPlanilla['additionalLines'] = [];
  const household: MonthPlanilla['householdLines'] = [];
  const debtPaymentLines: MonthPlanilla['debtPaymentLines'] = [];

  for (const row of rows) {
    const paid = coerceSqliteBoolean(row.is_paid);
    if (row.kind === 'fixed') {
      fixed.push({
        id: row.id,
        category: row.category,
        amountClp: coerceClpAmount(row.amount_clp),
        debtId: row.debt_id,
        paid,
      });
    } else if (row.kind === 'additional') {
      additional.push({
        id: row.id,
        category: row.category,
        amountClp: coerceClpAmount(row.amount_clp),
        debtId: row.debt_id,
        paid,
      });
    } else if (row.kind === 'household') {
      household.push({
        id: row.id,
        category: row.category,
        totalClp: coerceClpAmount(row.total_amount_clp ?? row.amount_clp),
      });
    } else if (row.kind === 'debt_payment' && row.debt_id) {
      const decoded = decodeDebtPaymentNote(row.note);
      debtPaymentLines.push({
        id: row.id,
        debtId: row.debt_id,
        paymentKind: decoded.paymentKind,
        installmentIndex: decoded.installmentIndex,
        amountClp: coerceClpAmount(row.amount_clp),
        paid,
      });
    } else if (row.type === 'income' && !record) {
      base.incomeClp += coerceClpAmount(row.amount_clp);
    }
  }

  if (fixed.length) base.fixedLines = fixed;
  if (additional.length) base.additionalLines = additional;
  if (household.length) base.householdLines = household;
  if (debtPaymentLines.length) base.debtPaymentLines = debtPaymentLines;

  return normalizePlanillaSplits(base);
}

export async function getFixedExpenseTemplate(db: SQLiteDatabase): Promise<FixedExpenseTemplate> {
  const parsed = parseFixedExpenseTemplate(await getSetting(db, FIXED_TEMPLATE_SETTING_KEY));
  if (parsed && parsed.items.length > 0) return parsed;
  return { items: [...DEFAULT_FIXED_EXPENSE_TEMPLATE.items] };
}

export async function saveFixedExpenseTemplate(db: SQLiteDatabase, template: FixedExpenseTemplate): Promise<void> {
  await setSetting(db, FIXED_TEMPLATE_SETTING_KEY, serializeFixedExpenseTemplate(template));
}

async function inferFixedTemplateFromDatabase(db: SQLiteDatabase): Promise<FixedExpenseTemplate> {
  const current = currentMonthKey();
  const raw = await loadMonthPlanillaRaw(db, current);
  if (raw.fixedLines.length > 0) {
    return {
      items: raw.fixedLines.map((l) => ({
        id: l.id,
        name: l.category.trim() || 'Ítem',
      })),
    };
  }
  const keys = await listAllMonthKeys(db);
  for (const key of [...keys].sort().reverse()) {
    const p = await loadMonthPlanillaRaw(db, key);
    if (p.fixedLines.length > 0) {
      return {
        items: p.fixedLines.map((l) => ({
          id: l.id,
          name: l.category.trim() || 'Ítem',
        })),
      };
    }
  }
  return { items: [...DEFAULT_FIXED_EXPENSE_TEMPLATE.items] };
}

export async function ensureFixedExpenseTemplateMigrated(db: SQLiteDatabase): Promise<void> {
  const existing = parseFixedExpenseTemplate(await getSetting(db, FIXED_TEMPLATE_SETTING_KEY));
  if (existing && existing.items.length > 0) return;
  await saveFixedExpenseTemplate(db, await inferFixedTemplateFromDatabase(db));
}

export async function syncFixedTemplateToOpenMonths(
  db: SQLiteDatabase,
  template: FixedExpenseTemplate,
  now = new Date(),
): Promise<void> {
  const current = currentMonthKey(now);
  const keys = await listAllMonthKeys(db);
  const targets = new Set<string>([current]);
  for (const k of keys) {
    if (canApplyTemplateToMonth(k, now)) targets.add(k);
  }

  for (const monthKey of targets) {
    if (!canApplyTemplateToMonth(monthKey, now)) continue;
    const raw = await loadMonthPlanillaRaw(db, monthKey);
    const merged = applyFixedTemplateToPlanilla(raw, template);
    await saveMonthPlanilla(db, merged, {
      applyDebtPayments: false,
      templateSync: true,
    });
  }
}

export async function loadMonthPlanilla(db: SQLiteDatabase, monthKey: string): Promise<MonthPlanilla> {
  const template = await getFixedExpenseTemplate(db);
  let planilla = await loadMonthPlanillaRaw(db, monthKey);
  if (canApplyTemplateToMonth(monthKey)) {
    planilla = applyFixedTemplateToPlanilla(planilla, template);
  }
  return applyDiezmoForMonth(planilla, monthKey);
}

export async function currentMonthFixedAmountForTemplateId(
  db: SQLiteDatabase,
  templateItemId: string,
): Promise<number> {
  const p = await loadMonthPlanillaRaw(db, currentMonthKey());
  return p.fixedLines.find((l) => l.id === templateItemId)?.amountClp ?? 0;
}

export async function revertMonthDebtPayments(db: SQLiteDatabase, monthKey: string): Promise<void> {
  const rows = await db.getAllAsync<TransactionRow>(
    `SELECT * FROM transactions WHERE month_key = ? AND kind = 'debt_payment' AND is_paid = 1`,
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
  options?: { applyDebtPayments?: boolean; templateSync?: boolean },
): Promise<void> {
  const mode = monthEditability(planilla.monthKey);
  const allowed =
    isMonthEditable(planilla.monthKey) || (options?.templateSync === true && mode !== 'closed');
  if (!allowed) {
    throw new Error('Solo puedes editar el mes actual. Este mes está cerrado o aún no editable.');
  }
  planilla = ensurePlanillaLineIds(applyDiezmoForMonth(planilla, planilla.monthKey));
  const monthKey = planilla.monthKey;
  const splits = pruneSplitsForLines(planilla);
  const legacyIds = Object.keys(splits);
  const legacyPeople = legacyIds.length > 0 ? Math.max(...legacyIds.map((id) => splits[id] ?? 2)) : 2;

  await db.runAsync(
    `INSERT INTO month_records (month_key, income_clp, reserve_clp, household_split_people, shared_split_people, shared_line_ids, shared_line_splits, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(month_key) DO UPDATE SET
       income_clp = excluded.income_clp,
       reserve_clp = excluded.reserve_clp,
       household_split_people = excluded.household_split_people,
       shared_split_people = excluded.shared_split_people,
       shared_line_ids = excluded.shared_line_ids,
       shared_line_splits = excluded.shared_line_splits,
       updated_at = excluded.updated_at`,
    monthKey,
    planilla.incomeClp,
    planilla.reserveClp,
    Math.max(1, planilla.householdSplitPeople),
    legacyPeople,
    JSON.stringify(legacyIds),
    JSON.stringify(splits),
    new Date().toISOString(),
  );

  const shouldApplyDebtPayments = options?.applyDebtPayments !== false;
  if (shouldApplyDebtPayments) {
    await revertMonthDebtPayments(db, monthKey);
  }

  const resolvedPayments = await syncMonthTransactions(db, planilla, {
    applyDebtPayments: shouldApplyDebtPayments,
  });

  if (shouldApplyDebtPayments && resolvedPayments.length > 0) {
    await applyDebtPayments(db, resolvedPayments);
  }
}

export async function buildMonthlyLedger(db: SQLiteDatabase, monthKey: string): Promise<MonthlyLedger> {
  const opening = Number.parseInt((await getSetting(db, `opening:${monthKey}`)) ?? '0', 10);
  const planilla = await loadMonthPlanilla(db, monthKey);
  const debtBalances = await getDebtBalances(db);
  const totals = computeMonthTotals(planilla, debtBalances);

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
    const debtBalances = await getDebtBalances(db);
    const totals = computeMonthTotals(planilla, debtBalances);
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
  const debtType = debt.debt_type ?? 'credit_card';
  await db.runAsync(
    `INSERT INTO debts (
       id, name, balance_clp, minimum_payment_clp, interest_rate_bps, sort_order, paid_off_at,
       debt_type, total_clp, installments_total, installment_amount_clp
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       balance_clp = excluded.balance_clp,
       minimum_payment_clp = excluded.minimum_payment_clp,
       interest_rate_bps = excluded.interest_rate_bps,
       sort_order = excluded.sort_order,
       paid_off_at = CASE WHEN excluded.balance_clp > 0 THEN NULL ELSE COALESCE(debts.paid_off_at, excluded.paid_off_at) END,
       debt_type = excluded.debt_type,
       total_clp = excluded.total_clp,
       installments_total = excluded.installments_total,
       installment_amount_clp = excluded.installment_amount_clp`,
    debt.id,
    debt.name,
    debt.balance_clp,
    debt.minimum_payment_clp,
    debt.interest_rate_bps,
    debt.sort_order ?? 0,
    debt.paid_off_at ?? null,
    debtType,
    debt.total_clp ?? null,
    debt.installments_total ?? null,
    debt.installment_amount_clp ?? null,
  );
}

export async function deleteDebt(db: SQLiteDatabase, debtId: string, now = new Date()): Promise<void> {
  const current = currentMonthKey(now);
  const keys = await listAllMonthKeys(db);
  const targets = new Set<string>([current]);
  for (const k of keys) {
    if (canApplyTemplateToMonth(k, now)) targets.add(k);
  }

  for (const monthKey of targets) {
    if (!isMonthEditable(monthKey, now) && !canApplyTemplateToMonth(monthKey, now)) continue;
    const raw = await loadMonthPlanillaRaw(db, monthKey);
    if (!planillaReferencesDebt(raw, debtId)) continue;
    const cleaned = removeDebtFromPlanilla(raw, debtId);
    if (isMonthEditable(monthKey, now)) {
      await saveMonthPlanilla(db, cleaned, { applyDebtPayments: true });
    } else {
      await saveMonthPlanilla(db, cleaned, { applyDebtPayments: false, templateSync: true });
    }
  }

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

export async function listDebtPaymentRecords(
  db: SQLiteDatabase,
  debtId: string,
): Promise<InstallmentPaymentRecord[]> {
  const rows = await db.getAllAsync<{
    month_key: string;
    amount_clp: number;
    note: string | null;
    is_paid: number;
  }>(
    `SELECT month_key, amount_clp, note, is_paid FROM transactions
     WHERE kind = 'debt_payment' AND debt_id = ?
     ORDER BY month_key ASC, created_at ASC`,
    debtId,
  );
  return rows.map((row) => {
    const decoded = decodeDebtPaymentNote(row.note);
    return {
      monthKey: row.month_key,
      paymentKind: decoded.paymentKind,
      installmentIndex: decoded.installmentIndex,
      amountClp: row.amount_clp,
      paid: row.is_paid === 1,
    };
  });
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
  p.sharedLineSplits = {};
  p.debtPaymentLines = [];
  const norm = (s: string) => s.trim().toLowerCase();
  const splitPeople = Math.max(2, month.householdSplitPeople ?? 2);
  for (const h of month.householdExpenses ?? []) {
    const match =
      p.fixedLines.find((f) => norm(f.category) === norm(h.category)) ??
      p.additionalLines.find((a) => norm(a.category) === norm(h.category));
    if (match && !p.sharedLineSplits[match.id]) {
      p.sharedLineSplits[match.id] = splitPeople;
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
      debt_type: 'credit_card',
      total_clp: null,
      installments_total: null,
      installment_amount_clp: null,
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

  if (months.length > 0) {
    const sample = importedMonthToPlanilla(months[0]);
    if (sample.fixedLines.length > 0) {
      await saveFixedExpenseTemplate(db, {
        items: sample.fixedLines.map((l) => ({ id: l.id, name: l.category })),
      });
    }
  }

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
    sharedLineSplits: {},
    householdLines: [],
    householdSplitPeople: 1,
    debtPaymentLines: [],
  };

  await saveMonthPlanilla(db, planilla);

  await saveFixedExpenseTemplate(db, {
    items: planilla.fixedLines.map((l) => ({ id: l.id, name: l.category })),
  });

  await upsertDebt(db, {
    id: id(),
    name: 'Tarjeta ficticia',
    balance_clp: 680_000,
    minimum_payment_clp: 45_000,
    interest_rate_bps: 2800,
    debt_type: 'credit_card',
    total_clp: null,
    installments_total: null,
    installment_amount_clp: null,
  });
  await upsertDebt(db, {
    id: id(),
    name: 'Préstamo demo',
    balance_clp: 900_000,
    minimum_payment_clp: 100_000,
    interest_rate_bps: 0,
    debt_type: 'personal',
    total_clp: 1_000_000,
    installments_total: 10,
    installment_amount_clp: 100_000,
  });

  await setSetting(db, 'emergency_fund_clp', '320000');
  await setSetting(db, 'extra_debt_payment_clp', '80000');
  await setSetting(db, 'onboarding_done', '1');
}
