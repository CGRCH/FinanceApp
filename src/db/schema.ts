export const SCHEMA_VERSION = 6;

export const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS month_records (
    month_key TEXT PRIMARY KEY NOT NULL,
    income_clp INTEGER NOT NULL DEFAULT 0,
    reserve_clp INTEGER NOT NULL DEFAULT 0,
    household_split_people INTEGER NOT NULL DEFAULT 1,
    shared_split_people INTEGER NOT NULL DEFAULT 2,
    shared_line_ids TEXT NOT NULL DEFAULT '[]',
    shared_line_splits TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS transactions (
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
  );`,
  `CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    balance_clp INTEGER NOT NULL,
    minimum_payment_clp INTEGER NOT NULL,
    interest_rate_bps INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    paid_off_at TEXT
  );`,
];

export type TransactionType = 'income' | 'expense';
export type ExpenseKind = 'fixed' | 'additional' | 'shared' | 'household' | 'debt_payment';

export interface TransactionRow {
  id: string;
  type: TransactionType;
  kind: ExpenseKind | null;
  category: string;
  amount_clp: number;
  total_amount_clp: number | null;
  split_people: number | null;
  debt_id: string | null;
  month_key: string;
  note: string | null;
  is_paid: number;
  created_at: string;
}

export interface DebtRow {
  id: string;
  name: string;
  balance_clp: number;
  minimum_payment_clp: number;
  interest_rate_bps: number;
  sort_order: number;
  paid_off_at: string | null;
}
