# Fase 5 — Performance mobile (cierre)

Fecha: 2026-05-07  
Rama: `feature-carlos`

## Objetivo (`mejoras.md` — Fase 5)

Mejorar fluidez y costo de render en pantallas móviles pesadas sin romper navegación ni UX.

## Alcance por bloque

### 5.1 — Equipos (`components/teams-screen.tsx`)

- Lista de descubrimiento (“Equipos en tu región” / “Ranking rival”): `FlashList` con contenedor acotado y `nestedScrollEnabled`.
- Imágenes remotas (logos, avatares): `expo-image` (`Image` con `contentFit="cover"`) para mejor decodificado y caché.

### 5.2 — Crear partido (`components/create-match-screen.tsx`)

- Modales de centro y hora: `FlatList` sustituida por `FlashList` con `modalListWrap` (altura máxima explícita).
- Pasos rival — listas de “tu equipo” y rivales: `FlashList` dentro de `embeddedListWrap` + `nestedScrollEnabled` (conviven con `ScrollView` principal).
- `renderItem` / filas modales extraídos a `useCallback` estables.

### 5.3 — Hub de partidos (`components/matches-hub-screen.tsx`)

- Lista principal: `FlashList` (API 2.x sin `estimatedItemSize` en tipos del proyecto).
- Tokens de tema (`ui`) memorizados con `useMemo`.
- `renderItem` memorizado con `useCallback` y dependencias explícitas.

### 5.4 — Carga diferida — Mi centro (`app/mi-centro.tsx`)

- `VenueDashboardScreen` cargado con `React.lazy` + `Suspense` para no inflar el bundle inicial hasta que una cuenta `venue` abre la ruta.

### Dependencia añadida

- `expo-image` (SDK 54).

## Riesgos y mitigación

| Riesgo | Mitigación |
|--------|------------|
| Scroll anidado (`FlashList` dentro de `ScrollView`) | Contenedores con `maxHeight` + `nestedScrollEnabled` donde aplica. |
| `FlashList` sin altura acotada en modales | `modalListWrap.maxHeight` en crear partido. |

## Validación

Ejecutar antes de merge:

- `npx tsc --noEmit`
- `npx expo-doctor`

## Pruebas manuales sugeridas

- **Equipos:** Región / Ranking, scroll largo, detalle, fotos.
- **Crear partido:** flujo rival (elegir equipo y rival), modales centro/hora con muchas opciones.
- **Partidos:** tabs Próximos / Invitaciones / Chats / Finalizados, pull-to-refresh.
- **Mi centro:** entrar con cuenta `venue`, comprobar que el dashboard carga tras el spinner breve de `Suspense`.

## Rollback

```bash
git revert <commit>
```
