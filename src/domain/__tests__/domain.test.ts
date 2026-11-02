import { buildAdvice } from '../advice';
import { compareStrategies, simulatePayoff } from '../debtStrategies';
import { computeProjection, monthBalanceClp } from '../projection';
import { yourShareClp } from '../sharedExpenses';
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
  it('resta gastos fijos, adicionales y compartidos', () => {
    const balance = monthBalanceClp({
      openingBalanceClp: 0,
      incomeClp: 1_000_000,
      fixedExpensesClp: 400_000,
      additionalExpensesClp: 150_000,
      sharedExpensesClp: 50_000,
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
