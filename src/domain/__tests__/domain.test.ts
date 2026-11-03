import { buildAdvice } from '../advice';
import { compareStrategies, simulatePayoff } from '../debtStrategies';
import { computeProjection, monthBalanceClp } from '../projection';
import { yourShareClp } from '../sharedExpenses';
import { computeMonthTotals, computeSharedSplitTotals, emptyPlanilla, matchDebtIdForCategory } from '../monthPlanilla';
import {
  isMonthEditable,
  monthEditability,
  preserveSelectedMonthKey,
} from '../monthEditability';
import { createFictionalFixtureWorkbook, parseGestiónWorkbook } from '../xlsxGestión';

describe('computeProjection', () => {
  it('calcula allowance diario y alerta de faltante', () => {
    const result = computeProjection({
      balanceNowClp: 300_000,
      pendingFixedClp: 100_000,
      pendingAdditionalClp: 50_000,
      avgDailyVariableClp: 10_000,
      dayOfMonth: 10,
      daysInMonth: 30,
    });

    expect(result.daysRemaining).toBe(20);
    expect(result.dailyAllowanceClp).toBe(Math.floor((300_000 - 150_000) / 20));
    expect(result.willRunShort).toBe(true);
    expect(result.projectedShortfallClp).toBeGreaterThan(0);
  });
});

describe('monthBalanceClp', () => {
  it('resta gastos y reserva', () => {
    const balance = monthBalanceClp({
      openingBalanceClp: 0,
      incomeClp: 1_000_000,
      fixedExpensesClp: 400_000,
      additionalExpensesClp: 150_000,
      sharedExpensesClp: 50_000,
      reserveClp: 80_000,
      fondosMenosGastosClp: 450_000,
      allOutflowsClp: 520_000,
    });
    expect(balance).toBe(400_000);
  });
});

describe('yourShareClp', () => {
  it('divide gasto compartido entre N personas', () => {
    expect(yourShareClp(90_000, 3)).toBe(30_000);
    expect(yourShareClp(100_000, 4)).toBe(25_000);
  });

  it('rechaza división inválida', () => {
    expect(() => yourShareClp(1000, 0)).toThrow();
  });
});

describe('debt strategies', () => {
  const debts = [
    {
      id: 'a',
      name: 'Chica',
      balanceClp: 200_000,
      minimumPaymentClp: 40_000,
      interestRateBps: 2400,
    },
    {
      id: 'b',
      name: 'Grande',
      balanceClp: 800_000,
      minimumPaymentClp: 80_000,
      interestRateBps: 1800,
    },
  ];

  it('simula bola de nieve y avalancha', () => {
    const snowball = simulatePayoff(debts, 50_000, 'snowball', new Date('2026-01-01'));
    const avalanche = simulatePayoff(debts, 50_000, 'avalanche', new Date('2026-01-01'));
    expect(snowball.months).toBeGreaterThan(0);
    expect(avalanche.months).toBeGreaterThan(0);
    expect(snowball.debtFreeMonth).toMatch(/^2026-/);
  });

  it('compara estrategias con recomendación', () => {
    const cmp = compareStrategies(debts, 50_000, new Date('2026-01-01'));
    expect(['snowball', 'avalanche']).toContain(cmp.recommended);
    expect(cmp.summary.length).toBeGreaterThan(10);
  });
});

describe('month editability', () => {
  const now = new Date('2026-11-15');

  it('solo el mes calendario actual es editable', () => {
    expect(isMonthEditable('2026-11', now)).toBe(true);
    expect(monthEditability('2026-10', now)).toBe('closed');
    expect(monthEditability('2026-12', now)).toBe('future');
    expect(isMonthEditable('2026-01', now)).toBe(false);
  });
});

describe('month selection', () => {
  it('no reclampa al mes con datos si el usuario eligió otro mes', () => {
    expect(preserveSelectedMonthKey('2026-10', ['2026-11'])).toBe('2026-10');
    expect(preserveSelectedMonthKey('2026-12', ['2026-11'])).toBe('2026-12');
  });
});

describe('month planilla totals', () => {
  it('calcula fondos menos gastos y parte hogar', () => {
    const p = emptyPlanilla('2026-10');
    p.incomeClp = 1_000_000;
    p.fixedLines[0].amountClp = 400_000;
    p.additionalLines = [{ id: 'a', category: 'Comida', amountClp: 100_000 }];
    p.reserveClp = 50_000;
    const t = computeMonthTotals(p);
    expect(t.fondosMenosGastosClp).toBe(500_000);
    expect(t.allOutflowsClp).toBe(500_000);
  });

  it('divide cuentas seleccionadas entre N personas', () => {
    const p = emptyPlanilla('2026-10');
    p.fixedLines[2].amountClp = 90_000;
    p.fixedLines[3].amountClp = 30_000;
    p.sharedSplitLineIds = [p.fixedLines[2].id, p.fixedLines[3].id];
    p.sharedSplitPeople = 3;
    const shared = computeSharedSplitTotals(p);
    expect(shared.selectedTotalClp).toBe(120_000);
    expect(shared.yourPartClp).toBe(40_000);
    const totals = computeMonthTotals(p);
    expect(totals.allOutflowsClp).toBe(40_000);
  });

  it('vincula categoría con deuda', () => {
    const id = matchDebtIdForCategory('Pago Brian', [{ id: '1', name: 'Brian' }]);
    expect(id).toBe('1');
  });
});

describe('parseGestiónWorkbook', () => {
  it('parsea fixture ficticio con meses y deudas', () => {
    const buffer = createFictionalFixtureWorkbook();
    const parsed = parseGestiónWorkbook(buffer);
    expect(parsed.year).toBe(2026);
    expect(parsed.months.length).toBeGreaterThanOrEqual(2);
    const enero = parsed.months.find((m) => m.monthKey === '2026-01');
    expect(enero?.incomes[0]?.amountClp).toBe(1_200_000);
    expect(enero?.fixedExpenses.some((f) => f.category === 'Arriendo')).toBe(true);
    expect(parsed.debts).toHaveLength(2);
    expect(parsed.debts[0].balanceClp).toBe(300_000);
  });
});

describe('buildAdvice', () => {
  it('prioriza deudas y alerta de faltante', () => {
    const tips = buildAdvice({
      totalDebtClp: 500_000,
      hasOverdueRisk: false,
      emergencyFundClp: 0,
      monthlyEssentialsClp: 400_000,
      projectedShortfallClp: 80_000,
      dailyAllowanceClp: 12_000,
    });
    expect(tips[0].id).toBe('shortfall');
    expect(tips.some((t) => t.id === 'debt-first')).toBe(true);
  });
});
