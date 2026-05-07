# SPORTMATCH — Guia completa para replicar en React Native (Android/iOS)

Documento operativo para migrar la app web actual (Next.js + Supabase) a una app mobile nativa con React Native.

## 1) Objetivo

- Replicar funcionalidad, look & feel y reglas de negocio de SPORTMATCH.
- Mantener Supabase como backend (Auth, DB, RLS, RPC, Realtime).
- Publicar app en Android (APK/AAB) e iOS (IPA/TestFlight/App Store).

## 2) Estado actual del proyecto web

- **Frontend:** Next.js 16 + React 19 + TypeScript.
- **UI:** Tailwind + componentes estilo shadcn/Radix.
- **Backend:** Supabase (Postgres + RLS + RPC + Realtime + Storage).
- **Estado cliente:** contexto global en `lib/app-context.tsx` + React Query.
- **Notificaciones:** in-app + Web Push + cron.
- **Dominio principal:** partidos (rival, revuelta, seleccion de equipos, buscar jugadores), equipos, chats, invitaciones, reservas de cancha, panel admin.

## 3) Stack recomendado para React Native

## 3.1 Base

- **Expo SDK (recomendado)** o React Native CLI.
- **TypeScript**.
- **React Navigation** (stack + tabs).
- **@tanstack/react-query** para datos remotos/cache.
- **@supabase/supabase-js** (auth + queries + rpc + realtime).

## 3.2 UI y estilos

Opciones:

1. **NativeWind + Tailwind tokens** (mas cercano al web actual).
2. **Tamagui / UI Kitten / Restyle** (si quieres sistema de diseño mas estricto).

Recomendado aqui: **NativeWind** para port directo de clases conceptuales.

## 3.3 Notificaciones push mobile reales

- **Expo Notifications** o **Firebase Cloud Messaging (FCM) + APNs**.
- Mantener tabla `notifications` y logica de negocio en Supabase.
- Reemplazar/compatibilizar `web-push` con push provider mobile.

## 4) Mapeo de arquitectura (Web -> Mobile)

## 4.1 Estado global

- Web: `AppProvider` centraliza auth + partidos + equipos + UI routing.
- Mobile: crear `AppProvider` equivalente o separar en stores:
  - `AuthStore`
  - `MatchStore`
  - `TeamStore`
  - `UIStore` (tab/pantalla/filtros)

## 4.2 Navegacion

- Web usa `currentScreen` por estado.
- Mobile recomendado:
  - `BottomTabs`: Inicio, Explorar, Partidos, Crear, Equipos, Perfil.
  - `NativeStack` por cada tab para detalle/chat/modales.

## 4.3 Datos

- Reusar query keys y patrones de React Query del web.
- Conservar contratos actuales:
  - `fetchMatchOpportunities`
  - `fetchParticipantsForOpportunity`
  - `join_match_opportunity`
  - `join_team_pick_match_opportunity`
  - `finalize_revuelta_match`, etc.

## 5) Sistema de diseno actual (para replicar)

## 5.1 Tokens de color

Fuente: `app/globals.css` (variables CSS).

Paleta principal:

- **Background oscuro** aproximado: `oklch(0.13 0 0)` (casi negro).
- **Texto primario**: blanco suave.
- **Primary verde SPORTMATCH**: `oklch(0.72 0.19 142)` en dark.
- **Accent dorado**: `oklch(0.82 0.16 85)`.
- **Destructive**: rojo.

Para RN definir tokens equivalentes en hex:

- `primaryGreen`
- `accentGold`
- `bgDark`
- `cardDark`
- `textPrimary`
- `textMuted`
- `borderDark`
- `danger`

## 5.2 Tipografia

- Sans moderna (Geist en web).
- En mobile usar:
  - Inter / SF Pro (iOS) / Roboto (Android) o fuente custom.
- Jerarquia sugerida:
  - `h1`: 28-32
  - `h2`: 22-26
  - `h3`: 18-20
  - `body`: 14-16
  - `caption`: 11-13

## 5.3 Componentes visuales clave

- Cards con bordes redondeados (`12-16` radio).
- Badges de estado (`pending`, `confirmed`, `invited`, `completed`, `cancelled`).
- Boton principal verde full-width.
- Boton secundario outline.
- Modales oscuros con CTA claro.
- Bottom tab fixed.

## 5.4 Patrones UX

- Mensajes cortos con feedback inmediato (toast/snackbar).
- Flujos guiados por pasos en `Crear`.
- Evitar sobresaturacion: acciones en menu `Gestionar`.
- Estados vacios claros en `Partidos`, `Chats`, `Invitaciones`.

## 6) Modulos funcionales a replicar

## 6.1 Auth + perfil

- Login/register, onboarding, foto perfil, datos jugador.
- Account types: `player`, `venue`, `admin`.
- Validaciones edad/telefono/ciudad.

## 6.2 Crear partido

Tipos:

- Buscar rival
- Buscar jugadores (actualmente pausado/no disponible en UI)
- Crear revuelta
- Seleccion de equipos (publico/privado)
- Solo reservar cancha

Notas clave:

- Mantener reglas de cada modo.
- Mantener wizard por pasos.

## 6.3 Detalle de partido

- Participantes, cupos, chat, gestionar, invitar.
- Reglas de invitacion:
  - `invited` no cuenta como participante activo.
  - Se une realmente al aceptar.
- Finalizacion:
  - rival: resultado rival.
  - revuelta/open y team_pick: resultado A/B/Empate.
  - players: casual.

## 6.4 Partidos hub

Tabs:

- Proximos
- Invitaciones
- Chats
- Finalizados

Importantisimo:

- Tab Invitaciones debe salir de fuente real de DB (`match_opportunity_participants.status='invited'`) y opcionalmente enlazar notificacion.

## 6.5 Equipos

- Crear/elegir equipo.
- Invitaciones a equipo.
- Solicitudes de ingreso.
- Roles capitan/vice.

## 6.6 Admin

- Dashboard y metricas.
- Crear partido admin por region/ciudad/centro.
- Organizador visible como Sportmatch.
- Admin no ocupa cupo.
- Gestion de partido desde detalle (no panel tecnico separado).

## 6.7 Notificaciones

- Centro de notificaciones en app.
- Deep links por tipo:
  - chat -> tab chats
  - invitacion -> tab invitaciones
  - finalizado pendiente reseña -> finalizados/detalle
- Reglas activas:
  - guardar 30
  - mostrar 10
  - retencion 30 dias
  - marcar todas leidas

## 7) Supabase y backend: que NO cambiar

- Mantener tablas, enums, RLS y RPC existentes.
- Reusar migraciones actuales como fuente de verdad.
- Mantener triggers de negocio (stats, notificaciones, restricciones de cupos).

Documentos de referencia interna:

- `DOCUMENTACION.md`
- `DOCUMENTACION-PROYECTO-COMPLETA.md`
- `PLAN_NOTIFICACIONES_E_INVITACIONES.md`

## 8) Diferencias web push vs mobile push

Web actual:

- `web-push` + service worker.

Mobile recomendado:

- Dispositivo obtiene `expoPushToken` (o FCM token).
- Guardar token por usuario/dispositivo en tabla de subscriptions mobile.
- Cron/proceso dispatch envia a proveedor mobile.

Resultado:

- Notificaciones reales en background/closed app en Android/iOS.

## 9) Estructura sugerida de proyecto RN

```txt
mobile/
  src/
    app/
      navigation/
      providers/
      theme/
    features/
      auth/
      home/
      explore/
      create/
      matches/
      chat/
      teams/
      profile/
      admin/
      notifications/
    shared/
      api/
      hooks/
      components/
      utils/
      types/
```

## 10) Plan de migracion recomendado (fases)

## Fase 1: Base tecnica

- Expo + TS + Navigation + Query + Supabase client.
- Tema dark/light + tokens.
- Auth y session persistence.

## Fase 2: Core usuario

- Home, Explorar, Partidos (upcoming/chats/finished), Detalle partido, Chat.

## Fase 3: Crear + invitaciones

- Wizard Crear (sin Buscar jugadores o en modo pausado como web actual).
- Invitaciones y tab Invitaciones real desde DB.

## Fase 4: Team pick + cierres

- Join team pick con eleccion equipo/rol.
- Finalizacion con resultado A/B/Empate y validaciones.

## Fase 5: Equipos y admin

- Equipos, invites/join requests.
- Admin dashboard + gestion de partidos.

## Fase 6: Push mobile + hardening

- Integracion push nativa.
- Observabilidad, crash reporting, analytics.
- QA final y stores.

## 11) Checklist tecnico de paridad

- [ ] Los mismos tipos de partido existen.
- [ ] `invited` no ocupa cupo ni aparece como activo.
- [ ] Tab Invitaciones muestra invitaciones pendientes reales.
- [ ] Aceptar invitacion une al jugador segun modo de partido.
- [ ] Team pick exige equipo/rol.
- [ ] Finalizacion de partidos registra resultado correcto.
- [ ] Stats post partido se aplican correctamente.
- [ ] Admin no ocupa cupo y aparece como Sportmatch.
- [ ] Notificaciones in-app deep-linkean a la tab correcta.
- [ ] Push mobile llega en segundo plano.

## 12) Riesgos y mitigaciones

- **RLS rompe lecturas mobile** -> validar policies por flujo antes de UI.
- **Diferencia de push web/mobile** -> separar pipeline de dispatch.
- **Lags de realtime** -> fallback polling corto + invalidaciones react-query.
- **Complejidad de app-context monolitico** -> dividir en feature stores.

## 13) Recomendaciones de implementacion

- Mantener dominio y SQL en Supabase como capa estable.
- Migrar frontend por modulos, no todo junto.
- Escribir pruebas de regresion de reglas clave:
  - cupos,
  - estados participantes,
  - finalizacion,
  - invitaciones.
- Congelar cambios de negocio grandes durante migracion mobile.

## 14) Definicion de "listo para produccion mobile"

- Paridad funcional >= 95% con web en flujos principales.
- Crash-free rate alto (>= 99% sesiones).
- Push funcionando en Android+iOS real.
- Tiempos de carga y navegacion fluidos en gama media.
- QA completo de roles: jugador, organizador, admin.

---

Si quieres, en el siguiente paso te puedo crear un segundo `.md` con el **backlog de tareas exacto (ticket por ticket)** para construir la app React Native por sprints.
