import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockReload = jest.fn();
const mockListDebts = jest.fn();
const mockListHistory = jest.fn();

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: () => ({}),
}));

jest.mock('@/src/context/FinanceContext', () => ({
  useFinance: () => ({
    debtComparison: {
      snowball: { months: 12, totalInterestClp: 50_000, debtFreeMonth: '2027-01' },
      avalanche: { months: 11, totalInterestClp: 45_000, debtFreeMonth: '2026-12' },
      recommended: 'avalanche',
      summary: 'Avalancha ahorra interés.',
    },
    extraDebtPaymentClp: 80_000,
    refresh: mockReload,
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
    danger: '#c00',
  }),
}));

jest.mock('@/src/db/repository', () => ({
  listDebts: (...args: unknown[]) => mockListDebts(...args),
  listDebtPaymentHistory: (...args: unknown[]) => mockListHistory(...args),
  deleteDebt: jest.fn(),
  upsertDebt: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import { DebtsManager } from '../DebtsManager';

describe('DebtsManager smoke', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListDebts.mockResolvedValue([
      {
        id: 'd1',
        name: 'Tarjeta',
        balance_clp: 500_000,
        minimum_payment_clp: 40_000,
        interest_rate_bps: 2400,
        sort_order: 0,
        paid_off_at: null,
        debt_type: 'credit_card',
        total_clp: null,
        installments_total: null,
        installment_amount_clp: null,
      },
    ]);
    mockListHistory.mockResolvedValue([]);
  });

  it('renderiza sin ReferenceError (formatClp importado)', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<DebtsManager />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(tree.toJSON()).toBeTruthy();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Abono extra mensual');
  });
});
