#!/usr/bin/env node
/**
 * Valida fondos menos gastos y reserva contra uploads/finanzas_cesar_2026.xlsx (local, no commiteado).
 * Uso: node scripts/validate-excel-formulas.cjs [ruta-al-xlsx]
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const xlsxPath =
    process.argv[2] ||
    path.join(__dirname, '../uploads/finanzas_cesar_2026.xlsx');

  if (!fs.existsSync(xlsxPath)) {
    console.error('No se encontró:', xlsxPath);
    console.error('Colocá el archivo en uploads/finanzas_cesar_2026.xlsx o pasá la ruta como argumento.');
    process.exit(2);
  }

  // Dynamic import of compiled domain would need tsx; use jest or tsx for full run.
  console.log('Archivo encontrado:', xlsxPath);
  console.log('Ejecutá: npx tsx scripts/validate-excel-formulas.ts', xlsxPath);
}

main();
