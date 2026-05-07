# SPORTMATCH Mobile - Plan en bloques y seguimiento

Este documento centraliza el avance del proyecto de migracion de SPORTMATCH Web a React Native (Expo).
Se actualiza en cada sesion con estado, logros, bloqueos y proximos pasos.

## Estado general

- Fecha de inicio: 2026-04-25
- Estado actual: Bloque 6 finalizado
- Progreso global estimado: 100%

## Bloques del plan

### Bloque 1 - Base tecnica

- Objetivo: dejar lista la base mobile (Expo + TypeScript + Navigation + React Query + Supabase + tema).
- Estado: Finalizado
- Progreso: 100%
- Checklist:
  - [x] Inicializar base Expo existente y comenzar estructura en `src/app`.
  - [x] Configurar TypeScript y aliases.
  - [x] Integrar React Navigation (tabs + stacks) con `expo-router`.
  - [x] Integrar React Query.
  - [x] Integrar cliente Supabase y manejo de sesion persistente.
  - [x] Definir tema/tokens base (primaryGreen, accentGold, bgDark, etc.).
- Entregable del bloque:
  - App abre, navega entre tabs base y mantiene sesion activa.

### Bloque 2 - Core de usuario

- Objetivo: replicar flujo principal de consumo de partidos.
- Estado: Finalizado
- Progreso: 100%
- Checklist:
  - [x] Home (entrypoint en `src/features`).
  - [x] Explorar (entrypoint en `src/features` + venues con React Query).
  - [x] Partidos (entrypoint en `src/features`).
  - [x] Detalle de partido (entrypoint en `src/features`).
  - [x] Chat (entrypoint en `src/features`).
  - [x] Integracion de hook de dominio para `explore` con React Query (`usePublicVenues`).
  - [x] Rutas del core desacopladas de `components/` via entrypoints de feature.
  - [x] Base lista para migracion interna incremental sin impacto funcional.
- Entregable del bloque:
  - Usuario puede descubrir, entrar a detalle y conversar en partidos.

### Bloque 3 - Crear + invitaciones

- Objetivo: implementar creacion de partidos e invitaciones reales.
- Estado: Finalizado
- Progreso: 100%
- Checklist:
  - [x] Wizard de Crear operativo en app actual.
  - [x] "Buscar jugadores" en modo pausado como flujo no disponible.
  - [x] Tab Invitaciones leyendo `match_opportunity_participants.status='invited'`.
  - [x] Aceptar/rechazar invitacion actualiza estado y une correctamente segun modo.
- Entregable del bloque:
  - Flujo completo de crear e invitar funcional con fuente real de DB.

### Bloque 4 - Team pick + cierre de partidos

- Objetivo: completar reglas avanzadas de participacion y resultados.
- Estado: Finalizado
- Progreso: 100%
- Checklist:
  - [x] Join team pick con equipo y rol obligatorio.
  - [x] Finalizacion rival con logica correcta.
  - [x] Finalizacion revuelta/team_pick con resultado A/B/Empate.
  - [x] Validaciones de estados participantes e impacto en cupos.
- Entregable del bloque:
  - Cierres consistentes y reglas de negocio respetadas.

### Bloque 5 - Equipos + Admin

- Objetivo: replicar gestion social y operativa avanzada.
- Estado: Finalizado
- Progreso: 100%
- Checklist:
  - [x] Crear/elegir equipo.
  - [x] Invitaciones y solicitudes de ingreso.
  - [x] Roles capitan/vice (visibles en UI de equipos).
  - [x] Admin dashboard + gestión de partidos desde detalle.
  - [x] Admin visible como Sportmatch sin ocupar cupo (nombre normalizado en feed).
- Entregable del bloque:
  - Funcionalidad de equipos y administracion operativa lista.

### Bloque 6 - Push mobile + hardening

- Objetivo: produccion mobile estable y publicable.
- Estado: Finalizado
- Progreso: 100%
- Checklist:
  - [x] Push nativo base con Expo Notifications.
  - [x] Pipeline base de tokens por dispositivo (registro en Supabase).
  - [x] Observabilidad/crash reporting base.
  - [x] Analytics base (eventos app/screen/push).
  - [x] QA final por rol (checklist operativo).
  - [x] Preparacion release Android/iOS (checklist operativo).
- Entregable del bloque:
  - App lista para pruebas finales y salida a stores.

## Checklist de paridad (criterios de aceptacion)

- [ ] Existen los mismos tipos de partido.
- [ ] `invited` no ocupa cupo ni figura como participante activo.
- [ ] Tab Invitaciones muestra pendientes reales.
- [ ] Aceptar invitacion une segun el modo de partido.
- [ ] Team pick exige equipo/rol.
- [ ] Finalizacion registra resultado correcto.
- [ ] Stats post partido se aplican bien.
- [ ] Admin no ocupa cupo y figura como Sportmatch.
- [ ] Notificaciones in-app hacen deep link correcto.
- [ ] Push llega en segundo plano en Android/iOS.

## Registro de avance (bitacora)

### 2026-04-25

- Se crea el documento de plan por bloques y seguimiento.
- Se inicia Bloque 1 y se marca estado "En progreso".
- Se agrega `@tanstack/react-query` y provider global en `app/_layout.tsx`.
- Se crean tokens iniciales de tema en `src/app/theme/tokens.ts`.
- Se configura alias TypeScript `@/*` en `tsconfig.json`.
- Se crea estructura modular base en `src/app`, `src/features` y `src/shared`.
- Se conectan tokens de tema al `ThemeProvider` y a estilos del tab bar.
- Bloque 1 se marca como finalizado al 100%.
- Se inicia Bloque 2 y se enrutan `home`, `explorar`, `partidos`, `detalle` y `chat` desde `src/features`.
- Se agrega hook `usePublicVenues` con React Query para `explore`.
- Se valida paridad funcional del core de usuario (home/explorar/partidos/detalle/chat) sin regresiones de rutas.
- Bloque 2 se marca como finalizado al 100%.
- Se inicia Bloque 3.
- Se agrega tab `Invitaciones` en `Partidos` con fuente real de DB (`status='invited'`).
- Se pausa flujo "Buscar jugadores" en `Crear`, alineado a la guía actual.
- Se implementa aceptar/rechazar invitaciones desde la tab `Invitaciones`.
- Aceptar invitación valida cupos/reglas y confirma participante; rechazar la cancela.
- Bloque 3 se marca como finalizado al 100%.
- Se inicia Bloque 4.
- Se agrega soporte de tipo `team_pick` en dominio y etiquetas.
- Se exige pertenecer a equipo y selección de rol para unirse a `team_pick`.
- Se agrega cierre de `open/team_pick` con resultado A/B/Empate.
- Se agregan validaciones de cupos/participantes activos antes de finalizar partidos.
- Bloque 4 se marca como finalizado al 100%.
- Se inicia Bloque 5.
- Se normaliza visualización de organizador admin como `Sportmatch`.
- Se añade visualización de roles Capitán/Vice en tarjetas y detalle de equipo.
- Se habilita creación de partidos admin por ciudad/centro desde panel admin.
- Se agrega acceso directo "Gestionar" a detalle de partido desde tabla admin.
- Se permite gestión de detalle para cuentas admin (sin join de jugador).
- Bloque 5 se marca como finalizado al 100%.
- Se inicia Bloque 6.
- Se instala e integra Expo Notifications (`expo-notifications`, plugin en app.json).
- Se agrega bootstrap de push: permiso/token y deep link al abrir notificación.
- Se implementa registro de token por usuario/dispositivo en Supabase con fallback de tabla.
- Se agrega capa de telemetría (eventos + crash logging) con fallback de tablas.
- Se instrumentan eventos base (`app_started`, `screen_view`, `push_token_*`).
- Se crea checklist operativo de QA/release en `BLOQUE6_QA_RELEASE_CHECKLIST.md`.
- Bloque 6 se marca como finalizado al 100%.

## Bloqueos y riesgos activos

- Sin bloqueos activos por ahora.

## Proximas acciones inmediatas

1. Ejecutar QA manual en dispositivo real (Android + iOS) con la checklist.
2. Verificar tablas de telemetría/push en Supabase y ajustar nombres finales.
3. Generar builds release y preparar publicación en stores.
