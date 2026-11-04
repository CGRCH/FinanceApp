import { monthEditability } from './monthEditability';
import type { MonthPlanilla, PlanillaLine } from './monthPlanilla';
import { pruneSplitsForLines, normalizeSharedLineSplits } from './sharedLineSplits';

export interface FixedTemplateItem {
  id: string;
  name: string;
}

export interface FixedExpenseTemplate {
  items: FixedTemplateItem[];
}

export const FIXED_TEMPLATE_SETTING_KEY = 'fixed_expense_template';

export const DEFAULT_FIXED_EXPENSE_TEMPLATE: FixedExpenseTemplate = {
  items: [
    { id: 'fixed-arriendo', name: 'Arriendo' },
    { id: 'fixed-luz', name: 'Luz' },
    { id: 'fixed-agua', name: 'Agua' },
    { id: 'fixed-internet', name: 'Internet' },
  ],
};

export function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

export function parseFixedExpenseTemplate(raw: string | null): FixedExpenseTemplate | null {
  if (!raw?.trim()) return null;
  try {
    const data = JSON.parse(raw) as FixedExpenseTemplate;
    if (!Array.isArray(data.items)) return null;
    const items = data.items
      .filter((i) => i && typeof i.id === 'string' && typeof i.name === 'string')
      .map((i) => ({ id: i.id, name: i.name.trim() }))
      .filter((i) => i.name.length > 0);
    return { items };
  } catch {
    return null;
  }
}

export function serializeFixedExpenseTemplate(template: FixedExpenseTemplate): string {
  return JSON.stringify(template);
}

export function canApplyTemplateToMonth(monthKey: string, now = new Date()): boolean {
  return monthEditability(monthKey, now) !== 'closed';
}

/** Alinea fixedLines con la plantilla (meses abiertos). Preserva montos/pagado por id o nombre legacy. */
export function applyFixedTemplateToPlanilla(
  planilla: MonthPlanilla,
  template: FixedExpenseTemplate,
): MonthPlanilla {
  const byId = new Map(planilla.fixedLines.map((l) => [l.id, l]));
  const byName = new Map<string, PlanillaLine>();
  for (const line of planilla.fixedLines) {
    const key = normalizeCategoryName(line.category);
    if (key && !byName.has(key)) byName.set(key, line);
  }

  const fixedLines: PlanillaLine[] = [];
  const splits = normalizeSharedLineSplits(planilla.sharedLineSplits);
  for (const item of template.items) {
    let line = byId.get(item.id);
    if (!line) {
      const legacy = byName.get(normalizeCategoryName(item.name));
      if (legacy) {
        line = { ...legacy, id: item.id, category: item.name };
        const div = splits[legacy.id];
        if (div != null && splits[item.id] == null) {
          splits[item.id] = div;
          delete splits[legacy.id];
        }
      } else {
        line = { id: item.id, category: item.name, amountClp: 0, paid: false };
      }
    } else {
      line = { ...line, category: item.name };
    }
    fixedLines.push(line);
  }

  const allowedIds = new Set(template.items.map((i) => i.id));
  const next: MonthPlanilla = { ...planilla, fixedLines, sharedLineSplits: splits };
  for (const id of Object.keys(splits)) {
    if (!allowedIds.has(id)) delete splits[id];
  }
  next.sharedLineSplits = splits;
  return { ...next, sharedLineSplits: pruneSplitsForLines(next) };
}

export function newFixedTemplateItemId(): string {
  return `fixed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function moveTemplateItem(
  template: FixedExpenseTemplate,
  fromIndex: number,
  toIndex: number,
): FixedExpenseTemplate {
  const items = [...template.items];
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
    return template;
  }
  const [removed] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, removed);
  return { items };
}
