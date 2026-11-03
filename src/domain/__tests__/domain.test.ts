import { buildAdvice } from '../advice';
import { compareStrategies, simulatePayoff } from '../debtStrategies';
import { computeProjection, monthBalanceClp } from '../projection';
import { yourShareClp } from '../sharedExpenses';
import { computeMonthTotals, computeSharedSplitTotals, emptyPlanilla, matchDebtIdForCategory } from '../monthPlanilla';
import {
  applyPaymentToBalance,
  resolveDebtPaymentAmounts,
  revertPaymentOnBalance,
} from '../debtPayments';
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
  it('fondos menos gastos = ingresos − solo pagados', () => {
    const p = emptyPlanilla('2026-10');
    p.incomeClp = 1_000_000;
    p.fixedLines[0].amountClp = 400_000;
    p.additionalLines = [{ id: 'a', category: 'Comida', amountClp: 100_000 }];
    p.reserveClp = 50_000;
    const t = computeMonthTotals(p);
    expect(t.fondosMenosGastosClp).toBe(1_000_000);
    expect(t.availableClp).toBe(1_000_000);
    expect(t.pendingOutflowsClp).toBe(500_000);
    expect(t.allOutflowsClp).toBe(500_000);
    expect(t.afterPayingAllClp).toBe(450_000);
  });

  it('caso César: arriendo no pagado no reduce fondos menos gastos', () => {
    const p = emptyPlanilla('2026-11');
    p.incomeClp = 1_450_000;
    p.fixedLines[0].category = 'Arriendo';
    p.fixedLines[0].amountClp = 420_000;
    p.fixedLines[0].paid = false;
    const t = computeMonthTotals(p);
    expect(t.fondosMenosGastosClp).toBe(1_450_000);
    expect(t.pendingOutflowsClp).toBe(420_000);
    p.fixedLines[0].paid = true;
    const t2 = computeMonthTotals(p);
    expect(t2.fondosMenosGastosClp).toBe(1_030_000);
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

  it('abono de deuda cuenta en pagados solo si paid', () => {
    const p = emptyPlanilla('2026-11');
    p.incomeClp = 500_000;
    p.debtPaymentLines = [
      { id: 'dp1', debtId: 'd1', paymentKind: 'partial', amountClp: 80_000, paid: false },
    ];
    const t = computeMonthTotals(p, { d1: 200_000 });
    expect(t.paidSoFarClp).toBe(0);
    expect(t.pendingOutflowsClp).toBe(80_000);
    p.debtPaymentLines[0].paid = true;
    const t2 = computeMonthTotals(p, { d1: 200_000 });
    expect(t2.paidSoFarClp).toBe(80_000);
    expect(t2.fondosMenosGastosClp).toBe(420_000);
  });
});

describe('debt payments', () => {
  it('resuelve pago total y abonos en orden', () => {
    const resolved = resolveDebtPaymentAmounts(
      [
        { debtId: 'd1', paymentKind: 'partial', amountClp: 50_000 },
        { debtId: 'd1', paymentKind: 'full', amountClp: 0 },
      ],
      { d1: 120_000 },
    );
    expect(resolved).toEqual([
      { debtId: 'd1', amountClp: 50_000, paymentKind: 'partial' },
      { debtId: 'd1', amountClp: 70_000, paymentKind: 'full' },
    ]);
  });

  it('revierte abono al balance', () => {
    const afterPay = applyPaymentToBalance(200_000, 80_000);
    expect(afterPay).toBe(120_000);
    expect(revertPaymentOnBalance(afterPay, 80_000)).toBe(200_000);
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
