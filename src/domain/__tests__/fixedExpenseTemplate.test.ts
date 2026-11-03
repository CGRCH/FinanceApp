import {
  applyFixedTemplateToPlanilla,
  canApplyTemplateToMonth,
  DEFAULT_FIXED_EXPENSE_TEMPLATE,
  moveTemplateItem,
} from '../fixedExpenseTemplate';
import { emptyPlanilla } from '../monthPlanilla';

describe('fixedExpenseTemplate', () => {
  it('mes cerrado no recibe plantilla (flag)', () => {
    expect(canApplyTemplateToMonth('2020-01', new Date('2026-11-15'))).toBe(false);
    expect(canApplyTemplateToMonth('2026-11', new Date('2026-11-15'))).toBe(true);
    expect(canApplyTemplateToMonth('2026-12', new Date('2026-11-15'))).toBe(true);
  });

  it('agrega ítems con monto 0 y preserva montos por id', () => {
    const p = emptyPlanilla('2026-11');
    p.fixedLines[0].amountClp = 420_000;
    const template = {
      items: [
        ...DEFAULT_FIXED_EXPENSE_TEMPLATE.items,
        { id: 'fixed-extra', name: 'Gas' },
      ],
    };
    const merged = applyFixedTemplateToPlanilla(p, template);
    expect(merged.fixedLines).toHaveLength(5);
    expect(merged.fixedLines[0].amountClp).toBe(420_000);
    expect(merged.fixedLines[4].category).toBe('Gas');
    expect(merged.fixedLines[4].amountClp).toBe(0);
  });

  it('reordena plantilla', () => {
    const t = {
      items: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    };
    const moved = moveTemplateItem(t, 0, 1);
    expect(moved.items.map((i) => i.id)).toEqual(['b', 'a']);
  });
});
