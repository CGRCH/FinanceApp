import React from 'react';
import renderer, { act } from 'react-test-renderer';

import type { MonthPlanilla } from '@/src/domain/monthPlanilla';
import { emptyPlanilla } from '@/src/domain/monthPlanilla';

const mockRefresh = jest.fn();
const mockRefreshMonthIndex = jest.fn();
const mockLoad = jest.fn();
const mockListDebts = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void) => {
    effect();
  },
}));

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: () => ({}),
}));

jest.mock('@/src/context/FinanceContext', () => ({
  useFinance: () => ({
    refresh: mockRefresh,
    refreshMonthIndex: mockRefreshMonthIndex,
    fixedTemplateRevision: 0,
  }),
}));

jest.mock('@/src/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    text: '#111',
    textSecondary: '#666',
    background: '#fff',
    surface: '#fff',
    surfaceMuted: '#eee',
    border: '#ccc',
    primary: '#0a0',
    primarySoft: '#efe',
    danger: '#c00',
    warning: '#fa0',
    warningSoft: '#ffe',
    accent: '#08f',
  }),
}));

jest.mock('@/src/db/repository', () => ({
  loadMonthPlanilla: (...args: unknown[]) => mockLoad(...args),
  listDebts: (...args: unknown[]) => mockListDebts(...args),
  saveMonthPlanilla: jest.fn(),
}));

import { PlanillaEditor } from '../PlanillaEditor';

describe('PlanillaEditor smoke', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const planilla: MonthPlanilla = {
      ...emptyPlanilla('2026-11'),
      incomeClp: 1_000_000,
      fixedLines: emptyPlanilla('2026-11').fixedLines.map((l, i) =>
        i === 0 ? { ...l, amountClp: 100_000 } : l,
      ),
    };
    mockLoad.mockResolvedValue(planilla);
    mockListDebts.mockResolvedValue([]);
  });

  it('renderiza sin error de hooks (useMemo importado)', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<PlanillaEditor monthKey="2026-11" />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(tree.toJSON()).toBeTruthy();
    expect(mockLoad).toHaveBeenCalled();
  });
});
