/** Id estable para líneas de planilla (fijos, adicionales, pagos de deuda). */
export function newPlanillaLineId(scope: 'fixed' | 'additional' | 'debt' | 'household' = 'additional'): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 9);
  return `${scope}-${stamp}-${rand}`;
}
