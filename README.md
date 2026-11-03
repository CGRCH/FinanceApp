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
- **Una pestaña a la vez en web**: SQLite usa almacenamiento OPFS; varias pestañas con FinanceApp pueden bloquearse. Si falla, la app muestra un mensaje para cerrar otras pestañas, reintentar o reiniciar datos locales.

## Flujo de uso

1. **Onboarding** — la app arranca **vacía**: elegís empezar en blanco, importar tu `.xlsx` o cargar datos de ejemplo (ficticios).
2. **Planilla del mes** — misma estructura que el Excel de César, todo editable en pantalla:
   - Selector de mes compacto (`‹ mes año ›`) en la parte superior (mobile-first; evita chips verticales en web).
   - **Gastos fijos**: vienen de la plantilla en **Ajustes** (solo montos en Planilla). **Gastos adicionales** libres en Planilla.
   - **Dividir cuentas** (acordeón, cerrado por defecto): cada ítem con toggle y divisor propio (÷2, ÷3…). En la fila del gasto se muestra **tu parte** y el total de la cuenta; Pagado/Disponible/Pendiente usan tu parte.
   - **Pagos de deudas** (mes actual): elegí deuda, **pago total** o **abono**; al guardar se descuenta del saldo (reversible si quitás el pago y guardás de nuevo). Historial en pestaña Deudas.
   - **Ítems pagados**: toggle *Pagado* en fijos, adicionales y pagos de deuda → **Fondo total**, **Pagado hasta ahora**, **Disponible**, **Pendiente**; el Panel usa el disponible.
   - **Cierre de meses**: solo el **mes actual** es editable; anteriores cerrados, futuros bloqueados. Navegación ‹ › / swipe sin resetear el mes vacío.
3. **Historial** — tarjetas resumen por mes; **detalle mes a mes** con el mismo navegador ‹ mes › (o swipe) además del listado.
4. **Panel / Deudas / Consejos / Ajustes** — el **Panel** muestra el **Disponible**. **Ajustes**: tema claro/oscuro/sistema y **plantilla de gastos fijos** (nombres, orden). Import/export Excel y datos de ejemplo están en **onboarding**; reinicio de BD en pantalla de error.

## Fórmulas de la planilla (verificables)

Montos en **tu parte** cuando un ítem está en *Dividir cuentas* (total de la cuenta ÷ divisor del ítem, redondeo entero CLP). El total original se guarda para desactivar la división.

| Concepto | Fórmula |
|----------|---------|
| **Disponible / Fondos menos gastos (app)** | `Ingresos − suma(tu parte de ítems con Pagado = true)` en fijos, adicionales y pagos de deuda |
| **Pendiente por pagar** | Suma de tu parte con Pagado = false (+ deudas pendientes) |
| **Total registrado (Tu gasto del mes)** | Suma de tu parte en fijos + adicionales + hogar + pagos de deuda cargados |
| **Quedaría después de pagar todo** | `Ingresos − total registrado − reserva` |
| **Excel clásico (import)** | `Fondos menos gastos = Ingresos − fijos − adicionales` (bruto, sin toggle Pagado ni pagos de deuda de la app) |

Evitá **doble conteo**: un pago de deuda va en *Pagos de deudas*, no repitas el mismo monto como gasto adicional.

En Planilla, **Ver cálculo** desglosa cada ítem. Validación contra tu `.xlsx` local:

```bash
npx tsx scripts/validate-excel-formulas.ts uploads/finanzas_cesar_2026.xlsx
```

(El archivo real no se commitea; el fixture ficticio de tests valida la misma lógica cuando la hoja trae fila *Fondos menos gastos*.)

## Arquitectura

```
app/                 Expo Router (tabs + onboarding)
src/domain/          Lógica pura (planilla, proyección, deudas, xlsx)
src/db/              SQLite + migraciones
src/components/      UI (PlanillaEditor, gráficos)
src/context/         FinanceProvider
```

Persistencia:

- `month_records` — ingresos, reserva, `shared_line_splits` (schema v5+)
- `settings.fixed_expense_template` — plantilla JSON de ítems fijos (schema v6)
- `transactions` — líneas fijas, adicionales y hogar
- `debts` — saldos, cuotas, tasas; `paid_off_at` cuando queda saldada
- `transactions` — líneas de planilla (`is_paid`, `debt_payment` para abonos)

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
