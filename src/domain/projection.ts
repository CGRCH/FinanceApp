export interface MonthlyLedger {
  openingBalanceClp: number;
  incomeClp: number;
  fixedExpensesClp: number;
  additionalExpensesClp: number;
  /** Parte individual hogar + legacy shared. */
  sharedExpensesClp: number;
  reserveClp: number;
  fondosMenosGastosClp: number;
  /** Gasto neto del usuario (con cuentas divididas). */
  allOutflowsClp?: number;
  /** Saldo disponible según ítems marcados pagados en planilla. */
  availableClp?: number;
  paidSoFarClp?: number;
  pendingOutflowsClp?: number;
}

export function totalExpensesClp(ledger: MonthlyLedger): number {
  return ledger.fixedExpensesClp + ledger.additionalExpensesClp + ledger.sharedExpensesClp;
}

export function monthBalanceClp(ledger: MonthlyLedger): number {
  if (ledger.allOutflowsClp != null) {
    return ledger.openingBalanceClp + ledger.incomeClp - ledger.allOutflowsClp - ledger.reserveClp;
  }
  return (
    ledger.openingBalanceClp +
    ledger.incomeClp -
    totalExpensesClp(ledger) -
    ledger.reserveClp
  );
}

export interface ProjectionInput {
  /** Saldo disponible hoy (después de lo ya registrado). */
  balanceNowClp: number;
  /** Gastos fijos aún no registrados este mes. */
  pendingFixedClp: number;
  /** Gastos variables/adicionales comprometidos pero no registrados. */
  pendingAdditionalClp: number;
  /** Promedio diario de gasto variable ya observado (opcional). */
  avgDailyVariableClp: number;
  dayOfMonth: number;
  daysInMonth: number;
}

export interface ProjectionResult {
  projectedEndBalanceClp: number;
  dailyAllowanceClp: number;
  willRunShort: boolean;
  daysRemaining: number;
  projectedShortfallClp: number;
}

export function computeProjection(input: ProjectionInput): ProjectionResult {
  const daysRemaining = Math.max(0, input.daysInMonth - input.dayOfMonth);
  const committedPending = input.pendingFixedClp + input.pendingAdditionalClp;
  const projectedVariable = Math.round(input.avgDailyVariableClp * daysRemaining);
  const projectedEnd = input.balanceNowClp - committedPending - projectedVariable;

  const spendablePool = input.balanceNowClp - committedPending;
  const dailyAllowance =
    daysRemaining > 0 ? Math.max(0, Math.floor(spendablePool / daysRemaining)) : Math.max(0, spendablePool);

  return {
    projectedEndBalanceClp: Math.round(projectedEnd),
    dailyAllowanceClp: dailyAllowance,
    willRunShort: projectedEnd < 0,
    daysRemaining,
    projectedShortfallClp: projectedEnd < 0 ? Math.abs(Math.round(projectedEnd)) : 0,
  };
}
