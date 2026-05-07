# Auditoria Completa Supabase/Postgres - SportMatch

Fecha: 2026-05-06  
Alcance: evaluacion tecnica de la base de datos Supabase/Postgres basada en migraciones SQL y uso real desde la app.  
Fuentes principales: `todaslasmigraciones.sql`, `lib/supabase/*`, `lib/app-provider.tsx`, pantallas con consultas RPC/directas.

---

## Resumen ejecutivo

La base actual tiene una base funcional solida (RLS, RPC, triggers, geografia, reservas), pero presenta riesgos de escalabilidad y operacion por:
- desalineaciones schema-app en push/telemetria,
- queries amplias sin paginacion sistematica,
- fan-out de notificaciones por trigger,
- patrones de concurrencia tipo check-then-write en cliente,
- y dependencias crecientes en tablas de alto volumen (`messages`, `notifications`, `venue_reservation_events`).

Prioridad inmediata: alinear schema con app, endurecer indices y observabilidad SQL, y migrar escrituras criticas a rutas transaccionales consistentes.

---

## 1) Todas las tablas identificadas

Tablas encontradas en migraciones consolidadas:
- `profiles`
- `match_opportunities`
- `match_opportunity_participants`
- `matches`
- `match_participants`
- `messages`
- `teams`
- `team_members`
- `team_invites`
- `match_opportunity_ratings`
- `rival_challenges`
- `team_join_requests`
- `team_private_settings`
- `sports_venues`
- `venue_courts`
- `venue_weekly_hours`
- `venue_reservations`
- `venue_reservation_events`
- `geo_countries`
- `geo_regions`
- `geo_cities`
- `player_reports`
- `revuelta_external_join_requests`
- `app_user_feedback`
- `match_opportunity_reschedules`
- `notifications`
- `sports_venue_reviews`
- `push_subscriptions`

Referencias desde app no encontradas de forma consistente en SQL consolidado:
- `mobile_push_subscriptions`
- `app_events`
- `telemetry_events`
- `app_crash_logs`
- `telemetry_crashes`

Adicional: funciones SQL hacen referencia a `venue_reservation_payment_history`, pero no se observa su `CREATE TABLE` en el consolidado.

## 2) Indices faltantes (priorizados)

## Prioridad alta
- `match_opportunities(date_time)` para listados ordenados amplios.
- `profiles(gender, account_type)` para filtros de exploracion de usuarios.
- `team_invites(inviter_id, created_at DESC)` para consultas por invitador.
- `rival_challenges(mode, status, created_at DESC)` para feed abierto.
- `match_opportunity_participants(opportunity_id, status)` para conteos/joins por estado.

## Prioridad media
- `venue_reservations(court_id, ends_at)` o estrategia por rango/exclusion mas fuerte para overlap.
- revisar direccion/uso de indice de `messages(opportunity_id, created_at)` para lecturas "ultimo mensaje".

## 3) Riesgos de performance

- Queries globales de partidos/equipos sin limites estrictos en varios flujos.
- Enriquecimiento en app por etapas (`IN (...)` sobre IDs crecientes), elevando roundtrips y payloads.
- Agregaciones admin en cliente en lugar de preagregacion server-side.
- Recarga completa de chat ante eventos realtime.
- Refetch completo post-mutacion en vez de actualizacion selectiva.

## 4) Riesgos RLS

- Politicas de lectura amplias para autenticados (incluyendo casos `USING (true)` en tablas sensibles).
- Exposicion anonima de metadatos en listados de `team_pick_private` (aun con `join_code` enmascarado).
- Riesgo de sobreexposicion de datos personales/sociales si el modelo de privacidad del producto cambia.

## 5) Riesgos de seguridad

- Divergencia entre modelo de datos esperado por app y schema real (push/telemetria): puede producir fallos silenciosos.
- Superficie amplia de funciones `SECURITY DEFINER` y triggers: requiere auditoria continua de privilegios y search_path.
- Operaciones de dominio ejecutadas directo desde cliente en algunos flujos (sin encapsulacion uniforme).

## 6) Queries costosas

Patrones concretos de alto costo:
- carga global de `match_opportunities` + consultas auxiliares de perfiles y participantes por lote.
- metricas admin con datasets amplios y agregacion en JS.
- listado de mensajes por oportunidad sin estrategia de ventana/paginacion.
- carga de equipos + miembros + perfiles en bloque.

## 7) Posibles scans completos

Riesgos de full scan / sort costoso:
- listados `select('*')` + `order(...)` sin filtros temporales o por estado.
- filtros por OR en invitaciones/solicitudes sin indices compuestos adecuados.
- feeds abiertos (`rival_challenges`) sin cobertura indexada completa.
- busquedas sociales (`profiles`) sin combinacion indexada para filtros principales.

## 8) Riesgos de concurrencia

- Flujos cliente con validacion previa + escritura posterior (check-then-write) en joins/invitaciones.
- Reserva de cancha por seleccion de slot libre + insercion posterior, sensible a contencion alta.
- Multiples rutas que tocan `match_opportunities` y `venue_reservations` con posibles esperas de lock.

Riesgo operativo:
- conflictos intermitentes,
- reintentos,
- estados transitorios incoherentes bajo carga.

## 9) Riesgos de duplicacion de datos

- Coexistencia de `city` (texto) y `city_id` (FK) en dominios clave: riesgo de divergencia.
- Snapshot de campos de presentacion (nombres/fotos) replicados en distintos contextos.
- Mantenimiento de datos derivados en app puede duplicar estado semantico.

## 10) Riesgos de integridad

- Referencias a tablas no presentes en SQL consolidado (`venue_reservation_payment_history`).
- Tabla/columnas esperadas por app no alineadas con schema consolidado (push/telemetria).
- Operaciones multi-step fuera de transaccion unica en algunos flujos cliente (con compensaciones manuales parciales).

## 11) RPC mal diseñadas (o mejorables)

No es tanto "mal diseñadas", sino mejorables para escala y observabilidad:
- RPC que retornan `jsonb` generico complican tipado estricto y trazabilidad de errores.
- falta estandar comun de contrato de errores/codigos por dominio.
- parte de logica critica aun distribuida fuera de RPC (join no uniforme, ciertas mutaciones admin/venue).

## 12) Triggers peligrosos

Triggers de mayor riesgo operativo por fan-out/costo:
- notificaciones por mensaje (`messages` -> `notifications` masivo).
- refresh de conteos de participantes en eventos de participacion.
- sincronizacion de estado de reserva y oportunidad.

Riesgo:
- write amplification,
- mayor contencion en horas pico,
- crecimiento acelerado de tablas de eventos/notificaciones.

## 13) Posibles deadlocks

No hay evidencia directa de deadlock confirmado en repo, pero hay condiciones de riesgo:
- transacciones/funciones que bloquean `match_opportunities` y otras que reaccionan a `venue_reservations`.
- si diferentes rutas adquieren locks en orden inverso, pueden aparecer deadlocks esporadicos.

Mitigacion:
- estandarizar orden de lock por dominio,
- monitorear `deadlocks` y `lock_wait` en Postgres.

## 14) Problemas de escalabilidad

- Patron actual de lectura y refresh escala bien en bajo volumen, pero degrada con crecimiento:
  - demasiadas lecturas completas,
  - demasiado trabajo de agregacion en cliente,
  - poca paginacion sistematica,
  - triggers de fan-out en tablas calientes.

## 15) Que tablas creceran mas rapido

## Crecimiento muy alto
- `messages`
- `notifications`
- `venue_reservation_events`
- `match_opportunity_participants`
- `venue_reservations`

## Crecimiento alto
- `match_opportunities`
- `team_members`
- `team_invites`
- `team_join_requests`
- `rival_challenges`

## Crecimiento medio
- `sports_venue_reviews`
- `app_user_feedback`
- `player_reports`

## 16) Que tablas deberian particionarse en el futuro

Candidatas principales a particion por tiempo (`created_at`, mensual/trimestral):
- `messages`
- `notifications`
- `venue_reservation_events`

Candidatas secundarias segun volumen:
- `match_opportunity_participants` (si historico crece fuerte)
- `venue_reservations` (si alta densidad por multiples centros)

## 17) Que datos deberian archivarse

- `notifications` antiguas (ya existe prune parcial; formalizar politica por SLA).
- `messages` historicos fuera de ventana operativa.
- `venue_reservation_events` antiguos (>12-18 meses, segun compliance).
- `match_opportunity_reschedules` historicos.
- `player_reports` cerrados antiguos.

## 18) Que constraints faltan

Principales huecos detectables desde uso real:
- reforzar constraints de unicidad/contexto en flujos sociales donde hoy depende de logica app.
- reforzar validaciones de formato para campos de contacto si son criticos de negocio.
- revisar constraints de consistencia entre columnas de ubicacion (`city` vs `city_id`) o migrar a una sola fuente.
- garantizar que tablas referenciadas por funciones existan en migracion fuente de verdad.

## 19) Que auditoria falta

- Auditoria homogena de cambios criticos (admin/moderacion/permisos) mas alla de eventos puntuales.
- Trazabilidad estandarizada para operaciones sensibles multi-tabla.
- Inventario automatico de desalineacion schema vs app esperada.

## 20) Que metricas SQL deberiamos monitorear

## Core rendimiento
- `pg_stat_statements`: top por `total_time`, `mean_time`, `calls`, `rows`.
- `seq_scan` vs `idx_scan` por tabla caliente.
- latencia p95/p99 por RPC critica.

## Concurrencia
- `lock_wait_time`, conteo de waits por relacion.
- `deadlocks` por intervalo.
- tiempo de transaccion en funciones de reserva/join.

## Capacidad y crecimiento
- filas nuevas por dia en `messages`, `notifications`, `venue_reservation_events`.
- bloat de tablas e indices.
- tamaño de tablas/indices por mes.

## Seguridad/RLS
- errores de policy por endpoint.
- tasa de `permission denied` por tabla.
- acceso anonimo/autenticado por tabla sensible.

## Calidad de datos
- tasa de conflicto de constraints.
- tasa de rollback/reintento en operaciones criticas.
- discrepancias entre columnas duplicadas semanticamente.

---

## Evaluacion por escala de usuarios

## Escenario 1.000 usuarios

Estado esperado:
- sistema funcional con degradaciones puntuales.

Riesgos dominantes:
- bugs por desalineacion schema-app (push/telemetria),
- algunas consultas lentas en picos,
- exposicion de datos por politicas amplias si no es intencional.

Acciones minimas:
- alinear schema-app,
- indices quick wins,
- monitoreo basico p95 y scans.

## Escenario 10.000 usuarios

Estado esperado:
- aparecen cuellos claros en consultas globales, chat y notificaciones.

Riesgos dominantes:
- fan-out de triggers,
- lock contention en reservas/joins,
- latencia variable por payloads grandes y agregacion en cliente.

Acciones necesarias:
- paginacion y fragmentacion de queries,
- endurecer rutas transaccionales,
- monitoreo avanzado de locks/deadlocks,
- plan de archivado temprano.

## Escenario 100.000 usuarios

Estado esperado:
- sin rediseño, la arquitectura actual sufrira saturacion en tablas calientes.

Riesgos dominantes:
- crecimiento explosivo de `messages/notifications`,
- costo de scans/sorts y mantenimiento de indices,
- mayor probabilidad de lock waits y deadlocks,
- costo operativo de almacenamiento y vacuum.

Acciones obligatorias:
- particion por tiempo en tablas calientes,
- estrategia formal de archivado/retencion,
- refactor de fan-out y agregaciones,
- observabilidad SQL madura con alertas automáticas.

---

## Prioridad de ejecucion recomendada

1. Corregir desalineaciones schema-app (push/telemetria/tablas referenciadas).  
2. Aplicar indices prioritarios en rutas de lectura caliente.  
3. Reducir consultas globales (paginacion/rangos/fragmentacion).  
4. Endurecer concurrencia en reservas/joins (ruta transaccional unica).  
5. Definir politica de retencion y plan de particion para tablas calientes.  
6. Implementar tablero de metricas SQL con alertas por lock/latencia/scan.
