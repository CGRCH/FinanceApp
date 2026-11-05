# Compilar FinanceApp con EAS Build

Esta guía describe cómo generar instalables de Android e iOS desde la rama de trabajo del proyecto. Los datos de la app siguen siendo **solo locales en cada dispositivo**; EAS solo compila el cliente nativo.

## Requisitos

- Cuenta en [Expo](https://expo.dev) y EAS CLI instalada (`npm install -g eas-cli` o `npx eas-cli`).
- Node.js y dependencias del repo (`npm install` en la raíz).
- Para iOS en dispositivo físico: cuenta de Apple Developer (certificados los gestiona EAS en el primer build).

## Configuración inicial (una vez por repositorio)

1. Inicia sesión: `npx eas login`
2. Enlaza el proyecto con Expo (crea `projectId` en `app.json` bajo `expo.extra.eas` — **no** lo copies manualmente antes de esto):
   ```bash
   npx eas init
   ```
3. Revisa `eas.json` y `app.json` (identificadores `cl.cgrch.financeapp`, versión local, perfiles `development`, `preview`, `production`).

Las versiones de marketing (`expo.version`, `android.versionCode`, `ios.buildNumber`) se leen del proyecto (`appVersionSource: local` en `eas.json`).

## Validar configuración

Antes de encolar builds:

```bash
npx expo config --type public
npm test
```

## Perfiles de build

| Perfil | Uso |
|--------|-----|
| `development` | Cliente de desarrollo (`developmentClient`) para probar con Metro. Distribución interna. |
| `preview` | APK Android / IPA iOS para pruebas internas (sin simulador en iOS). |
| `production` | Android App Bundle (Play Store); `autoIncrement` sube el número de build en EAS. |

## Comandos npm incluidos

Desde la raíz del repo:

```bash
# APK Android (perfil preview)
npm run build:apk

# iOS dispositivo (perfil preview)
npm run build:ios
```

Equivalente directo:

```bash
npx eas build --platform android --profile preview
npx eas build --platform ios --profile preview
```

Otros ejemplos:

```bash
npx eas build --platform android --profile production
npx eas build --platform all --profile development
```

## Después del build

- En [expo.dev](https://expo.dev) → tu proyecto → **Builds** verás el estado y el enlace de descarga (APK/IPA).
- Android: instala el APK en el dispositivo (origen desconocido habilitado si aplica).
- iOS: registra dispositivos UDID en perfil ad hoc/internal según el tipo de distribución que elijas en EAS.

## Notas

- **No** subas secretos al repositorio; las claves de firma las guarda EAS.
- Permisos de biometría (`USE_BIOMETRIC`, `USE_FINGERPRINT`) y el plugin `expo-local-authentication` están declarados en `app.json`.
- La rama `main` no debe recibir estos cambios hasta que decidas fusionar; trabaja en `cursor/finance-app-v1-ff4a` (o la rama activa del feature).
