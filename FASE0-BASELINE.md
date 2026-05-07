# Fase 0 — Freeze y seguridad (baseline)

Fecha: 2026-05-06  
Proyecto: SportMatch (`COPIAconExpo`)  
Rama: `feature-carlos`  
Alcance: **solo inventario y validación**. Sin cambios de lógica de producto ni refactors.

---

## 1. Git y rama

| Item | Estado |
|------|--------|
| Rama actual | `feature-carlos` |
| Tracking | `origin/feature-carlos` |
| Último commit | `b37a657` — Initial commit: SportMatch Expo app |
| Remoto | `https://github.com/Pirloko/sportmatchApp.git` |
| Working tree | Limpio salvo **`mejoras.md` sin seguimiento** (`?? mejoras.md`) |

**Acción opcional:** `git add mejoras.md && git commit -m "docs: plan de mejoras incrementales"` cuando quieras versionar el plan.

---

## 2. Entorno local (máquina de desarrollo)

| Item | Valor |
|------|--------|
| Node | v24.11.1 |
| npm | 11.6.2 |
| `node_modules` | Presente |

**Nota:** Node 24 es muy reciente; si en CI o EAS usan otra LTS, conviene documentar la versión “oficial” del equipo para evitar divergencias.

---

## 3. TypeScript

| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` | **OK** (sin errores) |

---

## 4. Expo Doctor (`npx expo-doctor`)

**14/17 checks OK. 3 fallos:**

### 4.1 Peer dependency faltante

- Falta **`expo-font`** (requerido por `@expo/vector-icons`).
- Riesgo: crash fuera de Expo Go si no se instala el peer.

### 4.2 Módulos nativos duplicados

- **`expo-constants`**: dos versiones (`18.0.13` en raíz y `55.0.15` anidado bajo `expo-notifications`).
- Riesgo: errores de build nativo impredecibles.

### 4.3 Versiones no alineadas con Expo SDK 54

Paquetes con **major mismatch** respecto al SDK instalado (`expo ~54.0.33`):

| Paquete | Esperado (SDK 54) | Instalado |
|---------|-------------------|-----------|
| `expo-device` | ~8.0.10 | 55.0.15 |
| `expo-notifications` | ~0.32.17 | 55.0.20 |
| `expo-web-browser` | ~15.0.11 | 55.0.14 |
| `babel-preset-expo` (dev) | ~54.0.10 | 55.0.13 |

Patch sugeridos por doctor: `expo` 54.0.34, `expo-image-picker`, `expo-linking` ligeramente por detrás.

**Conclusión:** el árbol de dependencias mezcla **familia SDK 54** con paquetes **55**; es el riesgo técnico más visible del baseline.

---

## 5. Seguridad de dependencias (`npm audit --omit=dev`)

- Reporte: **5 vulnerabilidades** (4 moderadas, 1 alta), cadena relacionada con `postcss` / `@expo/metro-config` / `expo`.
- `npm audit fix --force` propone saltos breaking (no aplicado en Fase 0).

**Fase 0:** solo registro. **Siguiente paso prudente:** revisar con `npm audit` completo y plan de actualización coordinado con `npx expo install --fix` / alineación SDK (Fase 1 o micro-bloque dedicado, con prueba de build).

---

## 6. Build / arranque (no ejecutado en servidor)

En esta máquina **no** se lanzó `expo start` ni build EAS (proceso largo / interactivo).

**Checklist manual recomendado para cerrar Fase 0 en tu entorno:**

- [ ] `npx expo start` (o `npm run start`) — proyecto arranca sin error.
- [ ] iOS Simulator o Android Emulator — pantalla principal carga.
- [ ] Login Supabase (entorno dev) — flujo mínimo OK.
- [ ] (Opcional) `eas build --profile preview --platform android` — validar que EAS puede resolver dependencias nativas.

---

## 7. Módulos críticos (mapa para bloques siguientes)

Áreas que **no** deben tocarse sin plan explícito en `mejoras.md`:

| Dominio | Ubicación principal |
|---------|------------------------|
| Auth y sesión | `lib/app-provider.tsx`, `lib/supabase/client.ts`, `components/auth-screen.tsx` |
| Estado global | `lib/app-provider.tsx` |
| Navegación / gates | `app/_layout.tsx`, `app/index.tsx`, `app/(tabs)/_layout.tsx` |
| Chat + realtime | `components/chat-screen.tsx`, `lib/supabase/message-queries.ts` |
| Partidos / join | `lib/app-provider.tsx`, `lib/supabase/join-match-opportunity.ts`, `lib/supabase/queries.ts` |
| Equipos | `components/teams-screen.tsx`, `lib/supabase/team-queries.ts` |
| Venues / reservas | `components/venue-dashboard-screen.tsx`, `lib/supabase/venue-owner-queries.ts` |
| Push | `lib/push/*` |
| Telemetría actual | `lib/telemetry/*` |
| SQL / RLS / RPC | `todaslasmigraciones.sql` (referencia), proyecto Supabase remoto |

---

## 8. Riesgos inmediatos (priorizados)

1. **Crítico (tooling):** desalineación **Expo SDK 54 vs paquetes 55** + `expo-constants` duplicado → riesgo alto de fallos en build de producción.
2. **Alto:** falta **`expo-font`** → riesgo en builds standalone.
3. **Medio:** vulnerabilidades `npm audit` → planificar sin `--force` a ciegas.
4. **Operativo:** `mejoras.md` sin commit → riesgo de pérdida del plan si no se versiona.
5. **Conocido de producto** (auditorías previas, no re-validado en F0): deep links `sportmatch` vs `pichanga`, Apple Sign-In, schema push/telemetry — corresponden sobre todo a **Fase 6** y bloques SQL/app acordados.

---

## 9. Qué NO se hizo en Fase 0 (por diseño)

- No se modificó `package.json`, lockfile ni código.
- No se ejecutó `expo install --fix` ni instalación de `expo-font`.
- No se alteró Supabase, RLS ni RPC.

---

## 10. Próximo bloque recomendado (Fase 1 — inicio)

Antes de Sentry/eventos, es **muy recomendable** un micro-bloque **0.5 — Alineación de dependencias Expo** (solo `npx expo install` alineado a SDK 54, `expo-font`, deduplicación), con:

- commit único,
- verificación `expo-doctor`,
- arranque local + una build preview si es posible.

Si prefieres ceñirte al orden literal del documento (`mejoras.md`), el siguiente paso sería **Fase 1 — Observabilidad**, asumiendo que aceptas el riesgo de construir sobre dependencias actualmente marcadas como inconsistentes por Expo.

---

## 11. Rollback de Fase 0

No hay cambios de código en el repo por esta fase. Si se añade solo `FASE0-BASELINE.md` (y opcionalmente `mejoras.md`), rollback: `git reset` / revert del commit de documentación.

---

## 12. Commit sugerido (solo documentación)

```bash
git add FASE0-BASELINE.md mejoras.md
git commit -m "docs: Fase 0 baseline (freeze, expo-doctor, riesgos)"
git push
```
