import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useSystemScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSQLiteContext } from 'expo-sqlite';

import { buildAdvice } from '@/src/domain/advice';
import { compareStrategies } from '@/src/domain/debtStrategies';
import {
  buildMonthCompare,
  buildMonthlyLedger,
  debtRowsToAccounts,
  getSetting,
  hasAnyFinanceData,
  importGestiónData,
  listAllMonthKeys,
  listDebts,
  listTransactionsForMonth,
  seedDemoData,
  setSetting,
} from '@/src/db/repository';
import { computeProjection, monthBalanceClp } from '@/src/domain/projection';
import { currentMonthKey, daysInMonth } from '@/src/domain/money';
import type { TransactionRow } from '@/src/db/schema';
import type { GestiónImportResult } from '@/src/domain/xlsxGestión';
import type { MonthComparePoint } from '@/src/domain/monthCompare';
import { resetLocalDatabase } from '@/src/db/databaseLifecycle';

type ThemePreference = 'system' | 'light' | 'dark';

interface FinanceContextValue {
  ready: boolean;
  bootstrapError: Error | null;
  slowBootHint: boolean;
  showOnboarding: boolean;
  completeOnboarding: () => Promise<void>;
  loadExampleData: () => Promise<void>;
  themePreference: ThemePreference;
  setThemePreference: (value: ThemePreference) => Promise<void>;
  effectiveScheme: 'light' | 'dark';
  monthKey: string;
  setMonthKey: (key: string) => void;
  monthKeys: string[];
  refreshMonthIndex: () => Promise<void>;
  comparePoints: MonthComparePoint[];
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
  retryBootstrap: () => void;
  resetLocalData: () => Promise<void>;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

const THEME_KEY = 'theme_preference';

export function FinanceProvider({
  children,
  onRequestRemount,
}: {
  children: React.ReactNode;
  onRequestRemount?: () => void;
}) {
  const db = useSQLiteContext();
  const system = useSystemScheme();
  const [ready, setReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<Error | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [slowBootHint, setSlowBootHint] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [monthKeys, setMonthKeys] = useState<string[]>([]);
  const [comparePoints, setComparePoints] = useState<MonthComparePoint[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [ledger, setLedger] = useState<Awaited<ReturnType<typeof buildMonthlyLedger>>>({
    openingBalanceClp: 0,
    incomeClp: 0,
    fixedExpensesClp: 0,
    additionalExpensesClp: 0,
    sharedExpensesClp: 0,
    reserveClp: 0,
    fondosMenosGastosClp: 0,
  });
  const [openingBalanceClp, setOpeningBalanceState] = useState(0);
  const [emergencyFundClp, setEmergencyFundClp] = useState(0);
  const [extraDebtPaymentClp, setExtraDebtPaymentClp] = useState(0);
  const [totalDebtClp, setTotalDebtClp] = useState(0);
  const [debtComparison, setDebtComparison] = useState<FinanceContextValue['debtComparison']>(null);

  const effectiveScheme: 'light' | 'dark' =
    themePreference === 'system' ? (system === 'dark' ? 'dark' : 'light') : themePreference;

  const refreshMonthIndex = useCallback(async () => {
    const keys = await listAllMonthKeys(db);
    setMonthKeys(keys);
    setComparePoints(await buildMonthCompare(db));
    if (keys.length && !keys.includes(monthKey)) {
      setMonthKey(keys[0]);
    }
  }, [db, monthKey]);

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
    let cancelled = false;
    const slowTimer = setTimeout(() => {
      if (!cancelled) setSlowBootHint(true);
    }, 12_000);

    (async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_KEY);
        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setThemePreferenceState(savedTheme);
        }
        const onboardingDone = (await getSetting(db, 'onboarding_done')) === '1';
        const hasData = await hasAnyFinanceData(db);
        if (!cancelled) setShowOnboarding(!onboardingDone && !hasData);
        await refreshMonthIndex();
        await refresh();
        if (!cancelled) {
          setBootstrapError(null);
          setReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          setBootstrapError(error instanceof Error ? error : new Error(String(error)));
          setReady(true);
        }
      } finally {
        clearTimeout(slowTimer);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, [db, refresh, refreshMonthIndex, bootstrapAttempt]);

  const retryBootstrap = useCallback(() => {
    setBootstrapError(null);
    setReady(false);
    setSlowBootHint(false);
    setBootstrapAttempt((n) => n + 1);
  }, []);

  const resetLocalData = useCallback(async () => {
    await resetLocalDatabase();
    onRequestRemount?.();
    retryBootstrap();
  }, [onRequestRemount, retryBootstrap]);

  useEffect(() => {
    if (ready) refresh();
  }, [monthKey, ready, refresh]);

  const setThemePreference = useCallback(async (value: ThemePreference) => {
    setThemePreferenceState(value);
    await AsyncStorage.setItem(THEME_KEY, value);
  }, []);

  const completeOnboarding = useCallback(async () => {
    await setSetting(db, 'onboarding_done', '1');
    setShowOnboarding(false);
  }, [db]);

  const loadExampleData = useCallback(async () => {
    await seedDemoData(db);
    await setSetting(db, 'onboarding_done', '1');
    setShowOnboarding(false);
    await refreshMonthIndex();
    await refresh();
  }, [db, refresh, refreshMonthIndex]);

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
      setShowOnboarding(false);
      await refreshMonthIndex();
      if (data.months.length) setMonthKey(data.months[data.months.length - 1].monthKey);
      await refresh();
      return result;
    },
    [db, refresh, refreshMonthIndex],
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
      bootstrapError,
      slowBootHint,
      showOnboarding,
      completeOnboarding,
      loadExampleData,
      themePreference,
      setThemePreference,
      effectiveScheme,
      monthKey,
      setMonthKey,
      monthKeys,
      refreshMonthIndex,
      comparePoints,
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
      retryBootstrap,
      resetLocalData,
    }),
    [
      ready,
      bootstrapError,
      slowBootHint,
      showOnboarding,
      completeOnboarding,
      loadExampleData,
      themePreference,
      setThemePreference,
      effectiveScheme,
      monthKey,
      monthKeys,
      refreshMonthIndex,
      comparePoints,
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
      retryBootstrap,
      resetLocalData,
    ],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance debe usarse dentro de FinanceProvider');
  return ctx;
}
