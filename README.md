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
   - Ingresos, gastos fijos y adicionales: agregar, renombrar o eliminar secciones e ítems; montos con **formato CLP** al salir del campo (p. ej. `$1.450.000`).
   - **Dividir cuentas**: activá con toggle qué ítems ya cargados (luz, agua, internet, etc.) querés repartir, elegí entre cuántas personas (stepper ≥ 2); ves total seleccionado y **tu parte**, integrado en los totales del mes.
   - **Pagos de deudas** (mes actual): elegí deuda, **pago total** o **abono**; al guardar se descuenta del saldo (reversible si quitás el pago y guardás de nuevo). Historial en pestaña Deudas.
   - **Ítems pagados**: toggle *Pagado* en fijos, adicionales y pagos de deuda → **Fondo total**, **Pagado hasta ahora**, **Disponible** y pendiente; el Panel usa el disponible.
   - **Cierre de meses**: solo el **mes actual** es editable; anteriores cerrados, futuros bloqueados. Navegación ‹ › / swipe sin resetear el mes vacío.
3. **Historial** — tarjetas resumen por mes; **detalle mes a mes** con el mismo navegador ‹ mes › (o swipe) además del listado.
4. **Panel / Deudas / Consejos / Ajustes** — el **Panel** muestra el **Disponible** (ingresos − ítems marcados pagados en planilla). **Deudas**: CRUD completo, historial de abonos, bola de nieve/avalancha con saldos actuales. Consejos y tema/import en Ajustes.

## Arquitectura

```
app/                 Expo Router (tabs + onboarding)
src/domain/          Lógica pura (planilla, proyección, deudas, xlsx)
src/db/              SQLite + migraciones
src/components/      UI (PlanillaEditor, gráficos)
src/context/         FinanceProvider
```

Persistencia:

- `month_records` — ingresos, reserva, personas del reparto y IDs de líneas compartidas (`shared_split_*`, schema v3)
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
