import * as XLSX from 'xlsx';

const MONTH_NAMES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

export interface ImportedMovement {
  category: string;
  amountClp: number;
  secondaryAmountClp?: number;
}

export interface ImportedMonth {
  monthKey: string;
  incomes: ImportedMovement[];
  fixedExpenses: ImportedMovement[];
  additionalExpenses: ImportedMovement[];
}

export interface ImportedDebt {
  name: string;
  originalClp: number;
  paidClp: number;
  balanceClp: number;
}

export interface GestiónImportResult {
  year: number;
  months: ImportedMonth[];
  debts: ImportedDebt[];
}

function normalizeLabel(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function toClp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number.parseInt(value.replace(/\./g, '').replace(/,/g, ''), 10);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function extractYear(sheetName: string): number {
  const match = sheetName.match(/(20\d{2})/);
  return match ? Number.parseInt(match[1], 10) : new Date().getFullYear();
}

function monthKey(year: number, monthName: string): string | null {
  const m = MONTH_NAMES[normalizeLabel(monthName)];
  if (!m) return null;
  return `${year}-${String(m).padStart(2, '0')}`;
}

function findMonthBlocks(headerRow: unknown[]): { monthName: string; baseCol: number }[] {
  const blocks: { monthName: string; baseCol: number }[] = [];
  for (let c = 0; c < headerRow.length; c += 1) {
    const label = String(headerRow[c] ?? '').trim();
    if (!label) continue;
    if (MONTH_NAMES[normalizeLabel(label)]) {
      blocks.push({ monthName: label, baseCol: c });
    }
  }
  return blocks;
}

function parseMonthColumn(rows: unknown[][], baseCol: number, year: number, monthName: string): ImportedMonth | null {
  const key = monthKey(year, monthName);
  if (!key) return null;

  const result: ImportedMonth = {
    monthKey: key,
    incomes: [],
    fixedExpenses: [],
    additionalExpenses: [],
  };

  let section: 'none' | 'fixed' | 'additional' = 'none';

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const labelRaw = String(row[baseCol] ?? '').trim();
    const label = normalizeLabel(labelRaw);

    if (!label) continue;

    if (label.startsWith('ingresos')) {
      const amount = toClp(row[baseCol + 1]);
      if (amount !== null && amount > 0) {
        result.incomes.push({ category: 'Ingresos', amountClp: amount });
      }
      continue;
    }

    if (label.startsWith('gastos fijos')) {
      section = 'fixed';
      continue;
    }
    if (label.startsWith('total gastos fijos')) {
      section = 'none';
      continue;
    }
    if (label.startsWith('gastos adicionales')) {
      section = 'additional';
      continue;
    }
    if (label.startsWith('total gastos a')) {
      section = 'none';
      continue;
    }

    if (label.startsWith('fondos menos gastos') || label.startsWith('reserva')) {
      continue;
    }

    const amount = toClp(row[baseCol + 1]);
    const secondary = toClp(row[baseCol + 2]);
    if (amount === null || amount === 0) continue;

    const movement: ImportedMovement = {
      category: labelRaw,
      amountClp: amount,
      secondaryAmountClp: secondary && secondary > 0 ? secondary : undefined,
    };

    if (section === 'fixed') {
      result.fixedExpenses.push(movement);
    } else if (section === 'additional') {
      result.additionalExpenses.push(movement);
    }
  }

  return result;
}

function parseDeudaSheet(rows: unknown[][]): ImportedDebt[] {
  if (rows.length < 2) return [];
  const header = rows[0].map((c) => normalizeLabel(c));
  const idxMonto = header.indexOf('monto');
  const idxAbono = header.indexOf('abono');
  const idxTotal = header.indexOf('total');
  const idxName = header.indexOf('deuda') >= 0 ? header.indexOf('deuda') : 0;

  const debts: ImportedDebt[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const name = String(row[idxName] ?? '').trim();
    if (!name) continue;
    const original = idxMonto >= 0 ? toClp(row[idxMonto]) : null;
    const paid = idxAbono >= 0 ? toClp(row[idxAbono]) ?? 0 : 0;
    const balance = idxTotal >= 0 ? toClp(row[idxTotal]) : null;
    if (balance === null) continue;
    debts.push({
      name,
      originalClp: original ?? balance + paid,
      paidClp: paid,
      balanceClp: balance,
    });
  }
  return debts;
}

export function parseGestiónWorkbook(data: ArrayBuffer | Uint8Array): GestiónImportResult {
  const workbook = XLSX.read(data, { type: 'array' });
  const gestionName =
    workbook.SheetNames.find((n) => normalizeLabel(n).includes('gestión')) ?? workbook.SheetNames[0];
  const gestionSheet = workbook.Sheets[gestionName];
  if (!gestionSheet) {
    throw new Error('No se encontró la hoja de gestión');
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(gestionSheet, {
    header: 1,
    defval: '',
  }) as unknown[][];

  const year = extractYear(gestionName);
  const headerRow = rows[0] ?? [];
  const blocks = findMonthBlocks(headerRow);

  const months: ImportedMonth[] = [];
  for (const block of blocks) {
    const parsed = parseMonthColumn(rows, block.baseCol, year, block.monthName);
    if (parsed) months.push(parsed);
  }

  const deudaSheetName = workbook.SheetNames.find((n) => normalizeLabel(n) === 'deuda');
  let debts: ImportedDebt[] = [];
  if (deudaSheetName) {
    const deudaRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[deudaSheetName], {
      header: 1,
      defval: '',
    }) as unknown[][];
    debts = parseDeudaSheet(deudaRows);
  }

  return { year, months, debts };
}

/** Genera bytes .xlsx a partir de datos internos (para exportación). */
export function buildGestiónWorkbook(
  year: number,
  months: ImportedMonth[],
  debts: ImportedDebt[],
): ArrayBuffer {
  const monthOrder = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];

  const gestionRows: unknown[][] = [];
  const header: unknown[] = [];
  for (const m of monthOrder) {
    header.push(m, '', '');
  }
  gestionRows.push(header);

  const incomeRow: unknown[] = [];
  const fixedHeader: unknown[] = [];
  const fixedRows: Record<string, unknown[]> = {};
  const additionalRows: Record<string, unknown[]> = {};

  for (let i = 0; i < 12; i += 1) {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const data = months.find((m) => m.monthKey === key);
    const income = data?.incomes[0]?.amountClp ?? '';
    incomeRow.push('Ingresos ', income, '');
    fixedHeader.push('Gastos Fijos', '', '');

    for (const fx of data?.fixedExpenses ?? []) {
      if (!fixedRows[fx.category]) {
        fixedRows[fx.category] = new Array(36).fill('');
      }
      const col = i * 3;
      fixedRows[fx.category][col] = fx.category;
      fixedRows[fx.category][col + 1] = fx.amountClp;
    }
    for (const ad of data?.additionalExpenses ?? []) {
      if (!additionalRows[ad.category]) {
        additionalRows[ad.category] = new Array(36).fill('');
      }
      const col = i * 3;
      additionalRows[ad.category][col] = ad.category;
      additionalRows[ad.category][col + 1] = ad.amountClp;
      if (ad.secondaryAmountClp) additionalRows[ad.category][col + 2] = ad.secondaryAmountClp;
    }
  }

  gestionRows.push(incomeRow);
  gestionRows.push(fixedHeader);
  for (const row of Object.values(fixedRows)) {
    gestionRows.push(row);
  }
  const totalFixed: unknown[] = [];
  for (let i = 0; i < 12; i += 1) {
    totalFixed.push('Total Gastos Fijos', '', '');
  }
  gestionRows.push(totalFixed);
  gestionRows.push(new Array(36).fill(''));

  const addHeader: unknown[] = [];
  for (let i = 0; i < 12; i += 1) {
    addHeader.push('Gastos Adicionales ', '', '');
  }
  gestionRows.push(addHeader);
  for (const row of Object.values(additionalRows)) {
    gestionRows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(gestionRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Gestión ${year}`);

  const deudaAoA = [
    ['Deuda', 'Monto', 'Abono', 'Total'],
    ...debts.map((d) => [d.name, d.originalClp, d.paidClp, d.balanceClp]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(deudaAoA), 'Deuda');

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

export function createFictionalFixtureWorkbook(): ArrayBuffer {
  const months: ImportedMonth[] = [
    {
      monthKey: '2026-01',
      incomes: [{ category: 'Ingresos', amountClp: 1_200_000 }],
      fixedExpenses: [
        { category: 'Arriendo', amountClp: 350_000 },
        { category: 'Internet', amountClp: 25_000 },
      ],
      additionalExpenses: [{ category: 'Supermercado', amountClp: 180_000 }],
    },
    {
      monthKey: '2026-02',
      incomes: [{ category: 'Ingresos', amountClp: 1_200_000 }],
      fixedExpenses: [{ category: 'Arriendo', amountClp: 350_000 }],
      additionalExpenses: [
        { category: 'Salida', amountClp: 60_000, secondaryAmountClp: 15_000 },
      ],
    },
  ];
  const debts: ImportedDebt[] = [
    { name: 'Tarjeta ficticia', originalClp: 400_000, paidClp: 100_000, balanceClp: 300_000 },
    { name: 'Préstamo demo', originalClp: 900_000, paidClp: 200_000, balanceClp: 700_000 },
  ];
  return buildGestiónWorkbook(2026, months, debts);
}
