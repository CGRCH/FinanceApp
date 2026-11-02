import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useSystemScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSQLiteContext } from 'expo-sqlite';

import { buildAdvice } from '@/src/domain/advice';
import { compareStrategies } from '@/src/domain/debtStrategies';
import { debtRowsToAccounts } from '@/src/db/repository';
import { computeProjection, monthBalanceClp } from '@/src/domain/projection';
import { currentMonthKey, daysInMonth } from '@/src/domain/money';
import {
  buildMonthlyLedger,
  importGestiónData,
  listDebts,
  listTransactionsForMonth,
  seedDemoData,
  getSetting,
  setSetting,
} from '@/src/db/repository';
import type { TransactionRow } from '@/src/db/schema';
import type { GestiónImportResult } from '@/src/domain/xlsxGestión';

type ThemePreference = 'system' | 'light' | 'dark';

interface FinanceContextValue {
  ready: boolean;
  themePreference: ThemePreference;
  setThemePreference: (value: ThemePreference) => Promise<void>;
  effectiveScheme: 'light' | 'dark';
  monthKey: string;
  setMonthKey: (key: string) => void;
  transactions: TransactionRow[];
  refresh: () => Promise<void>;
  ledger: Awaited<ReturnType<typeof buildMonthlyLedger>>;
  balanceClp: number;
  projection: ReturnType<typeof computeProjection>;
  advice: ReturnType<typeof buildAdvice>;
  debtComparison: ReturnType<typeof compareStrategies> | null;
  importFromParsed: (data: GestiónImportResult) => Promise<{ transactions: number; debts: number }>;
  openingBalanceClp: number;
  setOpeningBalanceClp: (value: number) => Promise<void>;
  emergencyFundClp: number;
  extraDebtPaymentClp: number;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

const THEME_KEY = 'theme_preference';

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const system = useSystemScheme();
  const [ready, setReady] = useState(false);
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [ledger, setLedger] = useState<Awaited<ReturnType<typeof buildMonthlyLedger>>>({
    openingBalanceClp: 0,
    incomeClp: 0,
    fixedExpensesClp: 0,
    additionalExpensesClp: 0,
    sharedExpensesClp: 0,
  });
  const [openingBalanceClp, setOpeningBalanceState] = useState(0);
  const [emergencyFundClp, setEmergencyFundClp] = useState(0);
  const [extraDebtPaymentClp, setExtraDebtPaymentClp] = useState(0);
  const [totalDebtClp, setTotalDebtClp] = useState(0);
  const [debtComparison, setDebtComparison] = useState<FinanceContextValue['debtComparison']>(null);

  const effectiveScheme: 'light' | 'dark' =
    themePreference === 'system' ? (system === 'dark' ? 'dark' : 'light') : themePreference;

  const refresh = useCallback(async () => {
    const rows = await listTransactionsForMonth(db, monthKey);
    const led = await buildMonthlyLedger(db, monthKey);
    const opening = Number.parseInt((await getSetting(db, `opening:${monthKey}`)) ?? '0', 10);
    const emergency = Number.parseInt((await getSetting(db, 'emergency_fund_clp')) ?? '0', 10);
    const extraDebt = Number.parseInt((await getSetting(db, 'extra_debt_payment_clp')) ?? '0', 10);
    const debtRows = await listDebts(db);
    const debts = debtRowsToAccounts(debtRows);

    setTransactions(rows);
    setLedger(led);
    setOpeningBalanceState(opening);
    setEmergencyFundClp(emergency);
    setExtraDebtPaymentClp(extraDebt);
    setTotalDebtClp(debtRows.reduce((sum, d) => sum + d.balance_clp, 0));
    setDebtComparison(debts.length ? compareStrategies(debts, extraDebt) : null);
  }, [db, monthKey]);

  useEffect(() => {
    (async () => {
      await seedDemoData(db);
      const savedTheme = await AsyncStorage.getItem(THEME_KEY);
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
        setThemePreferenceState(savedTheme);
      }
      await refresh();
      setReady(true);
    })();
  }, [db, refresh]);

  useEffect(() => {
    if (ready) refresh();
  }, [monthKey, ready, refresh]);

  const setThemePreference = useCallback(async (value: ThemePreference) => {
    setThemePreferenceState(value);
    await AsyncStorage.setItem(THEME_KEY, value);
  }, []);

  const setOpeningBalanceClp = useCallback(
    async (value: number) => {
      await setSetting(db, `opening:${monthKey}`, String(value));
      await refresh();
    },
    [db, monthKey, refresh],
  );

  const importFromParsed = useCallback(
    async (data: GestiónImportResult) => {
      const result = await importGestiónData(db, data.months, data.debts);
      await refresh();
      return result;
    },
    [db, refresh],
  );

  const balanceClp = monthBalanceClp(ledger);
  const now = new Date();
  const [year, monthNum] = monthKey.split('-').map(Number);
  const dayOfMonth = monthKey === currentMonthKey() ? now.getDate() : 1;
  const dim = daysInMonth(year, monthNum - 1);

  const variableSoFar = ledger.additionalExpensesClp;
  const avgDaily = dayOfMonth > 0 ? variableSoFar / dayOfMonth : 0;

  const projection = computeProjection({
    balanceNowClp: balanceClp,
    pendingFixedClp: 0,
    pendingAdditionalClp: 0,
    avgDailyVariableClp: avgDaily,
    dayOfMonth,
    daysInMonth: dim,
  });

  const advice = buildAdvice({
    totalDebtClp,
    hasOverdueRisk: projection.willRunShort,
    emergencyFundClp,
    monthlyEssentialsClp: ledger.fixedExpensesClp + Math.round(ledger.sharedExpensesClp),
    projectedShortfallClp: projection.projectedShortfallClp,
    dailyAllowanceClp: projection.dailyAllowanceClp,
  });

  const value = useMemo(
    () => ({
      ready,
      themePreference,
      setThemePreference,
      effectiveScheme,
      monthKey,
      setMonthKey,
      transactions,
      refresh,
      ledger,
      balanceClp,
      projection,
      advice,
      debtComparison,
      importFromParsed,
      openingBalanceClp,
      setOpeningBalanceClp,
      emergencyFundClp,
      extraDebtPaymentClp,
    }),
    [
      ready,
      themePreference,
      setThemePreference,
      effectiveScheme,
      monthKey,
      transactions,
      refresh,
      ledger,
      balanceClp,
      projection,
      advice,
      debtComparison,
      importFromParsed,
      openingBalanceClp,
      setOpeningBalanceClp,
      emergencyFundClp,
      extraDebtPaymentClp,
    ],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance debe usarse dentro de FinanceProvider');
  return ctx;
}
