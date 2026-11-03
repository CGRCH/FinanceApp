import type { SQLiteDatabase } from 'expo-sqlite';

import { SCHEMA_VERSION } from './schema';

export type MigrationState = {
  schemaVersion: number;
  hasTransactionsTable: boolean;
  hasTransactionsV2Table: boolean;
  transactionsHasDebtId: boolean;
  transactionsHasIsPaid: boolean;
};

export function shouldRebuildTransactionsTable(state: MigrationState): boolean {
  if (state.schemaVersion >= SCHEMA_VERSION) return false;
  if (state.hasTransactionsV2Table) return true;
  if (state.hasTransactionsTable && state.schemaVersion > 0 && state.schemaVersion < SCHEMA_VERSION) {
    return true;
  }
  return false;
}

export function isMigrationComplete(state: MigrationState): boolean {
  return state.schemaVersion >= SCHEMA_VERSION;
}

async function tableExists(db: SQLiteDatabase, name: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
    name,
  );
  return row != null;
}

async function columnExists(db: SQLiteDatabase, table: string, column: string): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

export async function readMigrationState(db: SQLiteDatabase): Promise<MigrationState> {
  let schemaVersion = 0;
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      'schema_version',
    );
    if (row?.value) schemaVersion = Number.parseInt(row.value, 10) || 0;
  } catch {
    schemaVersion = 0;
  }

  return {
    schemaVersion,
    hasTransactionsTable: await tableExists(db, 'transactions'),
    hasTransactionsV2Table: await tableExists(db, 'transactions_v2'),
    transactionsHasDebtId: (await tableExists(db, 'transactions'))
      ? await columnExists(db, 'transactions', 'debt_id')
      : false,
    transactionsHasIsPaid: (await tableExists(db, 'transactions'))
      ? await columnExists(db, 'transactions', 'is_paid')
      : false,
  };
}

async function ensureMonthRecordsTable(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS month_records (
    month_key TEXT PRIMARY KEY NOT NULL,
    income_clp INTEGER NOT NULL DEFAULT 0,
    reserve_clp INTEGER NOT NULL DEFAULT 0,
    household_split_people INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );`);
}

async function ensureSharedSplitColumns(db: SQLiteDatabase): Promise<void> {
  if (!(await tableExists(db, 'month_records'))) return;
  try {
    await db.execAsync('ALTER TABLE month_records ADD COLUMN shared_split_people INTEGER NOT NULL DEFAULT 2');
  } catch {
    /* existe */
  }
  try {
    await db.execAsync("ALTER TABLE month_records ADD COLUMN shared_line_ids TEXT NOT NULL DEFAULT '[]'");
  } catch {
    /* existe */
  }
}

async function ensureDebtsPaidOffColumn(db: SQLiteDatabase): Promise<void> {
  if (!(await tableExists(db, 'debts'))) return;
  try {
    await db.execAsync('ALTER TABLE debts ADD COLUMN paid_off_at TEXT');
  } catch {
    /* existe */
  }
}

async function ensureTransactionIsPaidColumn(db: SQLiteDatabase): Promise<void> {
  if (!(await tableExists(db, 'transactions'))) return;
  if (await columnExists(db, 'transactions', 'is_paid')) return;
  try {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN is_paid INTEGER NOT NULL DEFAULT 0');
  } catch {
    /* en transición */
  }
}

async function transactionsKindAllowsDebtPayment(db: SQLiteDatabase): Promise<boolean> {
  if (!(await tableExists(db, 'transactions'))) return true;
  const sqlRow = await db.getFirstAsync<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'",
  );
  return sqlRow?.sql?.includes('debt_payment') ?? false;
}

async function rebuildTransactionsForV4(db: SQLiteDatabase): Promise<void> {
  if (!(await tableExists(db, 'transactions'))) return;
  if (await tableExists(db, 'transactions_v2')) {
    await finishPartialTransactionsV2(db);
    return;
  }

  const hasIsPaid = await columnExists(db, 'transactions', 'is_paid');

  await db.execAsync(`CREATE TABLE transactions_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income','expense')),
    kind TEXT CHECK(kind IN ('fixed','additional','shared','household','debt_payment') OR kind IS NULL),
    category TEXT NOT NULL,
    amount_clp INTEGER NOT NULL,
    total_amount_clp INTEGER,
    split_people INTEGER,
    debt_id TEXT,
    month_key TEXT NOT NULL,
    note TEXT,
    is_paid INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );`);

  if (hasIsPaid) {
    await db.execAsync(`
      INSERT INTO transactions_v2 (
        id, type, kind, category, amount_clp, total_amount_clp, split_people, debt_id, month_key, note, is_paid, created_at
      )
      SELECT
        id, type, kind, category, amount_clp, total_amount_clp, split_people, debt_id, month_key, note, is_paid, created_at
      FROM transactions;
    `);
  } else {
    await db.execAsync(`
      INSERT INTO transactions_v2 (
        id, type, kind, category, amount_clp, total_amount_clp, split_people, debt_id, month_key, note, is_paid, created_at
      )
      SELECT
        id, type, kind, category, amount_clp, total_amount_clp, split_people, debt_id, month_key, note, 0, created_at
      FROM transactions;
    `);
  }

  await db.execAsync('DROP TABLE transactions');
  await db.execAsync('ALTER TABLE transactions_v2 RENAME TO transactions');
}

async function ensureDebtIdColumn(db: SQLiteDatabase): Promise<void> {
  if (!(await tableExists(db, 'transactions'))) return;
  if (await columnExists(db, 'transactions', 'debt_id')) return;
  try {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN debt_id TEXT');
  } catch {
    /* columna ya existe o tabla en transición */
  }
}

async function finishPartialTransactionsV2(db: SQLiteDatabase): Promise<void> {
  if (!(await tableExists(db, 'transactions_v2'))) return;
  if (await tableExists(db, 'transactions')) {
    await db.execAsync('DROP TABLE transactions');
  }
  await db.execAsync('ALTER TABLE transactions_v2 RENAME TO transactions');
}

async function rebuildTransactionsForV2(db: SQLiteDatabase): Promise<void> {
  if (await tableExists(db, 'transactions_v2')) {
    await finishPartialTransactionsV2(db);
    return;
  }

  if (!(await tableExists(db, 'transactions'))) return;

  if (await columnExists(db, 'transactions', 'debt_id')) {
    const sqlRow = await db.getFirstAsync<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'",
    );
    if (sqlRow?.sql?.includes('household')) {
      return;
    }
  }

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

  const hasDebtId = await columnExists(db, 'transactions', 'debt_id');
  if (hasDebtId) {
    await db.execAsync(`
      INSERT INTO transactions_v2 (
        id, type, kind, category, amount_clp, total_amount_clp, split_people, debt_id, month_key, note, created_at
      )
      SELECT
        id, type, kind, category, amount_clp, total_amount_clp, split_people, debt_id, month_key, note, created_at
      FROM transactions;
    `);
  } else {
    await db.execAsync(`
      INSERT INTO transactions_v2 (
        id, type, kind, category, amount_clp, total_amount_clp, split_people, debt_id, month_key, note, created_at
      )
      SELECT
        id, type, kind, category, amount_clp, total_amount_clp, split_people, NULL, month_key, note, created_at
      FROM transactions;
    `);
  }

  await db.execAsync('DROP TABLE transactions');
  await db.execAsync('ALTER TABLE transactions_v2 RENAME TO transactions');
}

async function setSchemaVersion(db: SQLiteDatabase, version: number): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    'schema_version',
    String(version),
  );
}

/** Migración idempotente v1 → v2 (segura ante reintentos y estados a medias). */
export async function migrateSchema(db: SQLiteDatabase): Promise<void> {
  await finishPartialTransactionsV2(db);

  let state = await readMigrationState(db);
  if (isMigrationComplete(state)) return;

  await db.withTransactionAsync(async () => {
    await ensureMonthRecordsTable(db);
    await ensureSharedSplitColumns(db);
    await ensureDebtsPaidOffColumn(db);
    await ensureTransactionIsPaidColumn(db);
    await ensureDebtIdColumn(db);

    state = await readMigrationState(db);
    if (shouldRebuildTransactionsTable(state)) {
      await rebuildTransactionsForV2(db);
    }

    if (state.schemaVersion < 4) {
      const allowsDebtPayment = await transactionsKindAllowsDebtPayment(db);
      if (!allowsDebtPayment || !state.transactionsHasIsPaid) {
        await rebuildTransactionsForV4(db);
      }
    }

    await setSchemaVersion(db, SCHEMA_VERSION);
  });
}

export function classifyDatabaseError(error: unknown): {
  title: string;
  message: string;
  suggestOtherTabs: boolean;
  suggestReset: boolean;
} {
  const raw = error instanceof Error ? error.message : String(error);
  const msg = raw.toLowerCase();

  const locked =
    msg.includes('locked') ||
    msg.includes('busy') ||
    msg.includes('opfs') ||
    msg.includes('worker') ||
    msg.includes('another tab') ||
    msg.includes('denied');

  const migration =
    msg.includes('migrate') ||
    msg.includes('no such table') ||
    msg.includes('no such column') ||
    msg.includes('constraint') ||
    msg.includes('schema');

  if (locked) {
    return {
      title: 'Base de datos en uso',
      message:
        'Otra pestaña del navegador puede estar usando FinanceApp y bloquea la base local (OPFS). Cerrá las otras pestañas con la app y probá de nuevo.',
      suggestOtherTabs: true,
      suggestReset: false,
    };
  }

  if (migration) {
    return {
      title: 'Problema al actualizar datos locales',
      message:
        'La base quedó en un estado inconsistente tras una actualización. Podés reintentar o reiniciar los datos locales (solo en este navegador).',
      suggestOtherTabs: false,
      suggestReset: true,
    };
  }

  return {
    title: 'No pudimos abrir tu base local',
    message:
      'Ocurrió un error al iniciar SQLite en este dispositivo. Cerrá otras pestañas con FinanceApp, reintentá o reiniciá los datos locales.',
    suggestOtherTabs: true,
    suggestReset: true,
  };
}
