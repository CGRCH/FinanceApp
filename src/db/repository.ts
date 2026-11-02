import type { SQLiteDatabase } from 'expo-sqlite';

import type { DebtAccount } from '@/src/domain/debtStrategies';
import type { MonthlyLedger } from '@/src/domain/projection';
import type { ImportedDebt, ImportedMonth } from '@/src/domain/xlsxGestión';
import { yourShareClp } from '@/src/domain/sharedExpenses';
import { currentMonthKey } from '@/src/domain/money';

import { CREATE_STATEMENTS, type DebtRow, type ExpenseKind, type TransactionRow, type TransactionType } from './schema';

function id(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function initDatabase(db: SQLiteDatabase): Promise<void> {
  for (const sql of CREATE_STATEMENTS) {
    await db.execAsync(sql);
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

export async function listTransactionsForMonth(db: SQLiteDatabase, monthKey: string): Promise<TransactionRow[]> {
  return db.getAllAsync<TransactionRow>(
    'SELECT * FROM transactions WHERE month_key = ? ORDER BY created_at DESC',
    monthKey,
  );
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
    monthKey?: string;
    note?: string;
  },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO transactions (id, type, kind, category, amount_clp, total_amount_clp, split_people, month_key, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id(),
    input.type,
    input.kind ?? null,
    input.category,
    input.amountClp,
    input.totalAmountClp ?? null,
    input.splitPeople ?? null,
    input.monthKey ?? currentMonthKey(),
    input.note ?? null,
    new Date().toISOString(),
  );
}

export async function deleteTransaction(db: SQLiteDatabase, transactionId: string): Promise<void> {
  await db.runAsync('DELETE FROM transactions WHERE id = ?', transactionId);
}

export async function buildMonthlyLedger(db: SQLiteDatabase, monthKey: string): Promise<MonthlyLedger> {
  const opening = Number.parseInt((await getSetting(db, `opening:${monthKey}`)) ?? '0', 10);
  const rows = await listTransactionsForMonth(db, monthKey);

  let incomeClp = 0;
  let fixedExpensesClp = 0;
  let additionalExpensesClp = 0;
  let sharedExpensesClp = 0;

  for (const row of rows) {
    if (row.type === 'income') {
      incomeClp += row.amount_clp;
    } else if (row.kind === 'fixed') {
      fixedExpensesClp += row.amount_clp;
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
    sharedExpensesClp,
  };
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

export async function importGestiónData(
  db: SQLiteDatabase,
  months: ImportedMonth[],
  debts: ImportedDebt[],
): Promise<{ transactions: number; debts: number }> {
  let txCount = 0;
  for (const month of months) {
    for (const inc of month.incomes) {
      await insertTransaction(db, {
        type: 'income',
        category: inc.category,
        amountClp: inc.amountClp,
        monthKey: month.monthKey,
      });
      txCount += 1;
    }
    for (const fx of month.fixedExpenses) {
      await insertTransaction(db, {
        type: 'expense',
        kind: 'fixed',
        category: fx.category,
        amountClp: fx.amountClp,
        monthKey: month.monthKey,
      });
      txCount += 1;
    }
    for (const ad of month.additionalExpenses) {
      await insertTransaction(db, {
        type: 'expense',
        kind: 'additional',
        category: ad.category,
        amountClp: ad.amountClp,
        monthKey: month.monthKey,
        note: ad.secondaryAmountClp ? `Extra: ${ad.secondaryAmountClp}` : undefined,
      });
      txCount += 1;
      if (ad.secondaryAmountClp) {
        await insertTransaction(db, {
          type: 'expense',
          kind: 'additional',
          category: `${ad.category} (2)`,
          amountClp: ad.secondaryAmountClp,
          monthKey: month.monthKey,
        });
        txCount += 1;
      }
    }
  }

  for (const d of debts) {
    await upsertDebt(db, {
      id: id(),
      name: d.name,
      balance_clp: d.balanceClp,
      minimum_payment_clp: Math.max(10_000, Math.round(d.balanceClp * 0.05)),
      interest_rate_bps: 1800,
    });
  }

  return { transactions: txCount, debts: debts.length };
}

export async function seedDemoData(db: SQLiteDatabase): Promise<void> {
  const seeded = await getSetting(db, 'demo_seeded');
  if (seeded === '1') return;

  const month = currentMonthKey();
  await setSetting(db, `opening:${month}`, '150000');

  await insertTransaction(db, {
    type: 'income',
    category: 'Sueldo',
    amountClp: 1_450_000,
    monthKey: month,
  });
  await insertTransaction(db, {
    type: 'expense',
    kind: 'fixed',
    category: 'Arriendo',
    amountClp: 420_000,
    monthKey: month,
  });
  await insertTransaction(db, {
    type: 'expense',
    kind: 'fixed',
    category: 'Cuentas básicas',
    amountClp: 85_000,
    monthKey: month,
  });
  await insertTransaction(db, {
    type: 'expense',
    kind: 'shared',
    category: 'Once compartida',
    amountClp: yourShareClp(36_000, 4),
    totalAmountClp: 36_000,
    splitPeople: 4,
    monthKey: month,
  });
  await insertTransaction(db, {
    type: 'expense',
    kind: 'additional',
    category: 'Supermercado',
    amountClp: 112_000,
    monthKey: month,
  });

  await upsertDebt(db, {
    id: id(),
    name: 'Tarjeta Ripley',
    balance_clp: 680_000,
    minimum_payment_clp: 45_000,
    interest_rate_bps: 2800,
  });
  await upsertDebt(db, {
    id: id(),
    name: 'Crédito consumo',
    balance_clp: 1_200_000,
    minimum_payment_clp: 95_000,
    interest_rate_bps: 1900,
  });

  await setSetting(db, 'emergency_fund_clp', '320000');
  await setSetting(db, 'extra_debt_payment_clp', '80000');
  await setSetting(db, 'demo_seeded', '1');
}
