export type DebtPaymentKind = 'full' | 'partial';

export interface DebtPaymentDraft {
  debtId: string;
  paymentKind: DebtPaymentKind;
  amountClp: number;
}

export interface ResolvedDebtPayment {
  debtId: string;
  amountClp: number;
  paymentKind: DebtPaymentKind;
}

/** Resuelve montos (pago total = saldo restante al momento) en orden de la planilla. */
export function resolveDebtPaymentAmounts(
  drafts: DebtPaymentDraft[],
  balancesByDebtId: Record<string, number>,
): ResolvedDebtPayment[] {
  const working = { ...balancesByDebtId };
  const resolved: ResolvedDebtPayment[] = [];

  for (const draft of drafts) {
    const balance = working[draft.debtId] ?? 0;
    if (balance <= 0) continue;

    let amount =
      draft.paymentKind === 'full' ? balance : Math.max(0, Math.min(draft.amountClp, balance));
    if (amount <= 0) continue;

    resolved.push({ debtId: draft.debtId, amountClp: amount, paymentKind: draft.paymentKind });
    working[draft.debtId] = balance - amount;
  }

  return resolved;
}

export function applyPaymentToBalance(balanceClp: number, paymentClp: number): number {
  return Math.max(0, balanceClp - Math.max(0, paymentClp));
}

export function revertPaymentOnBalance(balanceClp: number, paymentClp: number): number {
  return balanceClp + Math.max(0, paymentClp);
}

export function isDebtPaidOff(balanceClp: number): boolean {
  return balanceClp <= 0;
}
