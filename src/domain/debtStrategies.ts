export interface DebtAccount {
  id: string;
  name: string;
  balanceClp: number;
  minimumPaymentClp: number;
  /** Tasa anual en basis points (1500 = 15%). */
  interestRateBps: number;
}

export type PayoffStrategy = 'snowball' | 'avalanche';

export interface PayoffSimulation {
  strategy: PayoffStrategy;
  months: number;
  totalPaidClp: number;
  totalInterestClp: number;
  /** Primer día del mes en que quedan en cero todas las deudas (YYYY-MM). */
  debtFreeMonth: string | null;
}

function cloneDebts(debts: DebtAccount[]): DebtAccount[] {
  return debts.map((d) => ({ ...d }));
}

function applyMonthlyInterest(debts: DebtAccount[]): number {
  let interest = 0;
  for (const d of debts) {
    if (d.balanceClp <= 0) continue;
    const monthly = Math.round((d.balanceClp * d.interestRateBps) / 10000 / 12);
    d.balanceClp += monthly;
    interest += monthly;
  }
  return interest;
}

function pickExtraTarget(debts: DebtAccount[], strategy: PayoffStrategy): DebtAccount | null {
  const active = debts.filter((d) => d.balanceClp > 0);
  if (active.length === 0) return null;
  if (strategy === 'snowball') {
    return active.reduce((a, b) => (b.balanceClp < a.balanceClp ? b : a));
  }
  return active.reduce((a, b) => {
    if (b.interestRateBps !== a.interestRateBps) {
      return b.interestRateBps > a.interestRateBps ? b : a;
    }
    return b.balanceClp > a.balanceClp ? b : a;
  });
}

function monthKeyFromStart(start: Date, monthOffset: number): string {
  const d = new Date(start.getFullYear(), start.getMonth() + monthOffset, 1);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}`;
}

export function simulatePayoff(
  debtsInput: DebtAccount[],
  extraMonthlyClp: number,
  strategy: PayoffStrategy,
  startDate: Date = new Date(),
  maxMonths = 600,
): PayoffSimulation {
  const debts = cloneDebts(debtsInput);
  let months = 0;
  let totalPaid = 0;
  let totalInterest = 0;
  let debtFreeMonth: string | null = null;

  while (months < maxMonths) {
    const active = debts.filter((d) => d.balanceClp > 0);
    if (active.length === 0) break;

    totalInterest += applyMonthlyInterest(debts);
    let extra = extraMonthlyClp;

    for (const d of debts) {
      if (d.balanceClp <= 0) continue;
      const pay = Math.min(d.balanceClp, d.minimumPaymentClp);
      d.balanceClp -= pay;
      totalPaid += pay;
    }

    while (extra > 0) {
      const target = pickExtraTarget(debts, strategy);
      if (!target) break;
      const pay = Math.min(target.balanceClp, extra);
      target.balanceClp -= pay;
      extra -= pay;
      totalPaid += pay;
    }

    months += 1;
    if (debts.every((d) => d.balanceClp <= 0)) {
      debtFreeMonth = monthKeyFromStart(startDate, months - 1);
      break;
    }
  }

  return {
    strategy,
    months,
    totalPaidClp: totalPaid,
    totalInterestClp: totalInterest,
    debtFreeMonth,
  };
}

export interface StrategyComparison {
  snowball: PayoffSimulation;
  avalanche: PayoffSimulation;
  /** Estrategia que termina antes o paga menos interés. */
  recommended: PayoffStrategy;
  summary: string;
}

export function compareStrategies(
  debts: DebtAccount[],
  extraMonthlyClp: number,
  startDate: Date = new Date(),
): StrategyComparison {
  const snowball = simulatePayoff(debts, extraMonthlyClp, 'snowball', startDate);
  const avalanche = simulatePayoff(debts, extraMonthlyClp, 'avalanche', startDate);

  let recommended: PayoffStrategy = 'avalanche';
  if (snowball.months < avalanche.months) recommended = 'snowball';
  else if (snowball.months === avalanche.months && snowball.totalInterestClp < avalanche.totalInterestClp) {
    recommended = 'snowball';
  } else if (avalanche.totalInterestClp < snowball.totalInterestClp) {
    recommended = 'avalanche';
  }

  const summary =
    recommended === 'snowball'
      ? 'Bola de nieve: libera deudas chicas primero y puede darte motivación extra.'
      : 'Avalancha: ataca la deuda más cara y suele ahorrar intereses.';

  return { snowball, avalanche, recommended, summary };
}
