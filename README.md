# FinanceApp

App móvil de finanzas personales para Chile (montos en **CLP enteros**). Local-first: tus datos viven en **SQLite** en el dispositivo; no hay sincronización en la nube.

## Requisitos

- Node.js 20+
- Expo (vía `npx`)
- Expo Go o emulador Android/iOS

## Cómo correr

```bash
npm install
npm start
```

- `npm test` — lógica de negocio (proyección, planilla, deudas, import xlsx ficticio)
- `npm run web` — desarrollo web (SQLite vía WASM; primera compilación puede tardar)

### Arranque más rápido

- Se eliminó la carga de fuentes custom en el arranque (tipografía del sistema).
- SQLite desactiva el listener de cambios en caliente (`enableChangeListener: false`).
- En web, la **primera** compilación de Metro puede demorar varios minutos; las siguientes son mucho más rápidas. En móvil nativo el arranque suele ser inmediato con Expo Go.

## Flujo de uso

1. **Onboarding** — la app arranca **vacía**: elegís empezar en blanco, importar tu `.xlsx` o cargar datos de ejemplo (ficticios).
2. **Planilla del mes** — misma estructura que el Excel de César:
   - Ingresos
   - Gastos fijos (plantilla Alquiler, Tlf, Luz, Agua, Internet + ítems editables)
   - Gastos adicionales (ítems libres; pagos a deudas se vinculan al módulo Deudas al guardar)
   - **Fondos menos gastos** (calculado)
   - **Reserva**
   - **Gastos del mes general** (total hogar ÷ N personas, N configurable)
3. **Historial** — selector de meses, detalle y comparativa visual (ingresos, gastos, reserva).
4. **Panel / Deudas / Consejos / Ajustes** — proyección, estrategias de pago, reglas locales, tema e import/export.

## Arquitectura

```
app/                 Expo Router (tabs + onboarding)
src/domain/          Lógica pura (planilla, proyección, deudas, xlsx)
src/db/              SQLite + migraciones
src/components/      UI (PlanillaEditor, gráficos)
src/context/         FinanceProvider
```

Persistencia:

- `month_records` — ingresos, reserva y N del hogar por mes
- `transactions` — líneas fijas, adicionales y hogar
- `debts` — saldos; al guardar planilla, abonos adicionales vinculados reducen la deuda

## Importación Excel

Hoja **Gestión 20XX**: meses en columnas triplés; secciones Ingresos, Gastos Fijos, Gastos Adicionales, Reserva, Gastos del mes general (con split `/ N`).

Hoja **Deuda**: `Monto`, `Abono`, `Total` — define saldos iniciales al importar (los pagos del mes quedan en adicionales **sin** doble descontar saldo).

**No commitees `.xlsx` con datos reales** (`.gitignore`).

## Capturas

Pantallas con datos ficticios en `docs/screenshots/`.

## Tests

```bash
npm test
```
