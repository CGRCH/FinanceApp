import { applyFixedTemplateToPlanilla } from '../fixedExpenseTemplate';
import { emptyPlanilla } from '../monthPlanilla';
import { DEFAULT_FIXED_EXPENSE_TEMPLATE } from '../fixedExpenseTemplate';

describe('Planilla reload after template change', () => {
  it('aplica ítems nuevos de plantilla sobre planilla en memoria', () => {
    const p = emptyPlanilla('2026-12');
    p.fixedLines[0].amountClp = 50_000;
    const extended = {
      items: [...DEFAULT_FIXED_EXPENSE_TEMPLATE.items, { id: 'fixed-gas', name: 'Gas' }],
    };
    const merged = applyFixedTemplateToPlanilla(p, extended);
    expect(merged.fixedLines).toHaveLength(5);
    expect(merged.fixedLines.find((l) => l.category === 'Gas')?.amountClp).toBe(0);
    expect(merged.fixedLines[0].amountClp).toBe(50_000);
  });
});
