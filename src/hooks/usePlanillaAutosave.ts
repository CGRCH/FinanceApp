import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { applyDiezmoForMonth } from '@/src/domain/diezmo';
import { shouldApplyReloadAfterSave } from '@/src/domain/planillaAutosave';
import { linkPlanillaDebtCategories } from '@/src/domain/planillaPersistence';
import type { MonthPlanilla } from '@/src/domain/monthPlanilla';
import { loadMonthPlanilla, listDebts, saveMonthPlanilla } from '@/src/db/repository';
import type { DebtRow } from '@/src/db/schema';
import type { SQLiteDatabase } from 'expo-sqlite';

export type PlanillaSavePriority = 'debounced' | 'immediate';

export type PlanillaSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 500;
const SAVED_INDICATOR_MS = 2000;

type Options = {
  db: SQLiteDatabase;
  monthKey: string;
  editable: boolean;
  planilla: MonthPlanilla | null;
  setPlanilla: (next: MonthPlanilla) => void;
  setDebts?: (rows: DebtRow[]) => void;
  debts: DebtRow[];
  refresh: () => Promise<void>;
  refreshMonthIndex: () => Promise<void>;
  onError?: (message: string) => void;
};

export function usePlanillaAutosave({
  db,
  monthKey,
  editable,
  planilla,
  setPlanilla,
  setDebts,
  debts,
  refresh,
  refreshMonthIndex,
  onError,
}: Options) {
  const [status, setStatus] = useState<PlanillaSaveStatus>('idle');
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const planillaRef = useRef(planilla);
  const monthKeyRef = useRef(monthKey);

  planillaRef.current = planilla;
  monthKeyRef.current = monthKey;

  const clearDebounce = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const persistNow = useCallback(
    async (snapshot: MonthPlanilla, savedRevision: number) => {
      if (!editable) return;
      setStatus('saving');
      try {
        const linked = linkPlanillaDebtCategories(snapshot, debts);
        await saveMonthPlanilla(db, linked);
        await refreshMonthIndex();
        await refresh();
        if (shouldApplyReloadAfterSave(revisionRef.current, savedRevision)) {
          dirtyRef.current = false;
          const [loaded, debtRows] = await Promise.all([
            loadMonthPlanilla(db, monthKeyRef.current),
            listDebts(db),
          ]);
          setPlanilla(applyDiezmoForMonth(loaded, monthKeyRef.current));
          setDebts?.(debtRows);
          setStatus('saved');
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(() => setStatus('idle'), SAVED_INDICATOR_MS);
        } else {
          setStatus('pending');
        }
      } catch (e) {
        setStatus('error');
        onError?.(e instanceof Error ? e.message : 'No se pudo guardar');
      }
    },
    [db, debts, editable, onError, refresh, refreshMonthIndex, setDebts, setPlanilla],
  );

  const flushSave = useCallback(async () => {
    clearDebounce();
    const snapshot = planillaRef.current;
    if (!snapshot || !editable || !dirtyRef.current) return;
    const rev = revisionRef.current;
    if (inFlightRef.current) {
      await inFlightRef.current;
    }
    const run = persistNow(snapshot, rev);
    inFlightRef.current = run;
    await run;
    inFlightRef.current = null;
  }, [clearDebounce, editable, persistNow]);

  const queueSave = useCallback(
    (priority: PlanillaSavePriority, snapshot?: MonthPlanilla) => {
      if (!editable) return;
      const snap = snapshot ?? planillaRef.current;
      if (!snap) return;
      planillaRef.current = snap;
      dirtyRef.current = true;
      revisionRef.current += 1;
      const rev = revisionRef.current;
      setStatus((s) => (s === 'saving' ? 'saving' : 'pending'));

      clearDebounce();
      if (priority === 'immediate') {
        void (async () => {
          if (inFlightRef.current) await inFlightRef.current;
          const run = persistNow(snap, rev);
          inFlightRef.current = run;
          await run;
          inFlightRef.current = null;
        })();
        return;
      }
      timerRef.current = setTimeout(() => {
        void (async () => {
          if (inFlightRef.current) await inFlightRef.current;
          const current = planillaRef.current;
          if (!current || revisionRef.current !== rev) return;
          const run = persistNow(current, rev);
          inFlightRef.current = run;
          await run;
          inFlightRef.current = null;
        })();
      }, DEBOUNCE_MS);
    },
    [clearDebounce, editable, persistNow],
  );

  const updatePlanilla = useCallback(
    (next: MonthPlanilla, priority: PlanillaSavePriority = 'debounced') => {
      planillaRef.current = next;
      setPlanilla(next);
      queueSave(priority, next);
    },
    [queueSave, setPlanilla],
  );

  const reloadIfClean = useCallback(async () => {
    if (dirtyRef.current) return;
    const loaded = await loadMonthPlanilla(db, monthKey);
    setPlanilla(applyDiezmoForMonth(loaded, monthKey));
  }, [db, monthKey, setPlanilla]);

  useEffect(() => {
    return () => {
      clearDebounce();
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, [clearDebounce]);

  useEffect(() => {
    void flushSave();
  }, [monthKey, flushSave]);

  useEffect(() => {
    const onState = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        void flushSave();
      }
    };
    const sub = AppState.addEventListener('change', onState);
    return () => sub.remove();
  }, [flushSave]);

  const resetLocalEdits = useCallback(() => {
    dirtyRef.current = false;
    clearDebounce();
    setStatus('idle');
  }, [clearDebounce]);

  return {
    updatePlanilla,
    queueSave,
    flushSave,
    reloadIfClean,
    resetLocalEdits,
    status,
    isDirty: () => dirtyRef.current,
  };
}
