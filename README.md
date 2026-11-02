# FinanceApp

App móvil de finanzas personales para Chile (montos en **CLP enteros**). Local-first: tus datos viven en **SQLite** en el dispositivo; no hay sincronización en la nube.

## Requisitos

- Node.js 20+
- [Expo CLI](https://docs.expo.dev/) (incluido vía `npx`)
- Expo Go en Android/iOS, o emulador

## Cómo correr

```bash
npm install
npm start
```

Atajos:

- `npm run android` — abre en Android
- `npm run ios` — abre en iOS (macOS o Expo Go)
- `npm run web` — vista web para desarrollo
- `npm test` — pruebas de lógica de negocio

## Arquitectura

```
app/                    # Expo Router (pantallas y navegación)
src/
  domain/               # Lógica pura (proyección, deudas, parser xlsx, consejos)
  db/                   # SQLite: esquema y repositorio
  context/              # Estado global FinanceProvider
  components/           # UI reutilizable y gráficos (Victory Native)
  services/             # Import/export xlsx, notificaciones locales
  theme/                # Tokens de diseño (claro/oscuro)
```

### Decisiones clave

| Tema | Enfoque |
|------|---------|
| Moneda | Enteros CLP en toda la app |
| Persistencia | `expo-sqlite`, seed demo ficticio al primer inicio |
| Gráficos | `victory-native` + Skia |
| Excel | SheetJS (`xlsx`): import compatible con hoja **Gestión** (meses en bloques de 3 columnas) y **Deuda** (Monto, Abono, Total) |
| Notificaciones | `expo-notifications` solo locales |

### Pantallas

1. **Panel** — saldo del mes, proyección a fin de mes, alerta de faltante, “cuánto podís gastar por día”, gráfico de gastos.
2. **Movimientos** — ingresos, gastos fijos, adicionales y compartidos (tu parte = total ÷ N).
3. **Deudas** — listado, comparación **bola de nieve** vs **avalancha**, mes estimado libre de deudas.
4. **Consejos** — reglas locales (primero deudas, luego fondo de emergencia).
5. **Ajustes** — tema claro/oscuro/sistema, importar/exportar `.xlsx`, recordatorio local.

## Importación Excel

Formato esperado (compatible con plantilla “Gestión 20XX”):

- Hoja principal con meses en columnas triplés: categoría | monto | columna auxiliar.
- Secciones: Ingresos, Gastos Fijos, Gastos Adicionales.
- Hoja **Deuda**: columnas `Deuda`, `Monto`, `Abono`, `Total`.

**No incluyas archivos `.xlsx` con datos reales en el repositorio** (están en `.gitignore`).

## Tests

Los tests cubren:

- Proyección y allowance diario
- Gastos compartidos
- Simulación bola de nieve / avalancha
- Parser xlsx con fixture **ficticio** generado en código

```bash
npm test
```

## Capturas (datos ficticios de demo)

Las pantallas principales se documentan en `docs/screenshots/` (`panel`, `movimientos`, `deudas`, `consejos`, `ajustes`).

## Privacidad

FinanceApp no envía montos ni movimientos a servidores. Exportá e importá archivos manualmente cuando lo necesites.
