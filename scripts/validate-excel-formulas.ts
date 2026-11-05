import fs from 'node:fs';

import { compareImportedMonthToExcelFormulas } from '../src/domain/excelFormulaCheck';
import { parseGestiónWorkbook } from '../src/domain/xlsxGestión';

const xlsxPath = process.argv[2] ?? `${process.cwd()}/uploads/finanzas_cesar_2026.xlsx`;

if (!fs.existsSync(xlsxPath)) {
  console.error('No se encontró:', xlsxPath);
  process.exit(2);
}

const buffer = fs.readFileSync(xlsxPath);
const parsed = parseGestiónWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

console.log('Validación Gestión', parsed.year, '—', parsed.months.length, 'meses\n');

let fondosOk = 0;
let fondosDiff = 0;
let fondosMissing = 0;

for (const month of parsed.months) {
  const check = compareImportedMonthToExcelFormulas(month);
  const fondosLine =
    check.fondosFromSheet === null
      ? 'sin fila fondos en hoja'
      : check.fondosMatches
        ? 'OK'
        : `DIFF hoja=${check.fondosFromSheet} calc=${check.fondosComputedExcelStyle}`;

  if (check.fondosFromSheet === null) fondosMissing += 1;
  else if (check.fondosMatches) fondosOk += 1;
  else fondosDiff += 1;

  console.log(
    check.monthKey,
    '| reserva OK:',
    check.reserveMatches,
    '| fondos:',
    fondosLine,
  );
}

console.log('\nResumen: fondos OK', fondosOk, 'diff', fondosDiff, 'sin fila', fondosMissing);
process.exit(fondosDiff > 0 ? 1 : 0);
