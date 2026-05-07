# Fase 4 — SQL y performance backend (100% alcance seguro)

Fecha: 2026-05-07  
Rama: `feature-carlos`

## Objetivo (`mejoras.md` — Fase 4)

Optimizar SQL y concurrencia sin romper frontend ni contratos existentes, cubriendo:

- analisis de tablas calientes (`match_opportunities`, `messages`, `teams`, `reservations`, `notifications`)
- deteccion de scans costosos/indices faltantes
- mejoras SQL incrementales y seguras (no destructivas)
- plan de validacion con `EXPLAIN ANALYZE` y monitoreo operativo

## Analisis realizado

### Tablas y rutas calientes verificadas

- `match_opportunities`: listado global ordenado por `date_time` (`fetchMatchOpportunities`).
- `messages`: carga/paginacion de chat por `opportunity_id` + orden temporal.
- `match_opportunity_participants`: conteos/joins por oportunidad y estado.
- `team_invites`: lectura principal por invitado; cobertura parcial para invitador.
- `rival_challenges`: filtros por `status` y uso creciente por `mode`.
- `venue_reservations`: acceso por cancha/horario en reservas y conciliacion con partidos.
- `notifications`: ya existian indices recientes para user/read/push pending.

### Riesgos detectados (resumen)

- sort y scans en listados amplios por tiempo/estado.
- costo creciente de chat con alto volumen de mensajes.
- rutas de reserva con riesgo de contention bajo carga.
- fan-out de notificaciones (riesgo operativo, no resuelto con cambios destructivos).

## Implementacion segura aplicada

Se agregaron indices **`IF NOT EXISTS`** al final de `todaslasmigraciones.sql`:

1. `idx_match_opportunities_date_time`
2. `idx_match_opportunities_active_time` (parcial: `status IN ('pending','confirmed')`)
3. `idx_profiles_gender_account_type`
4. `idx_team_invites_inviter_created_desc`
5. `idx_rival_challenges_mode_status_created_desc`
6. `idx_mop_opportunity_status`
7. `idx_messages_opp_created_id_desc`
8. `idx_venue_reservations_court_ends_at`

## Por que estos cambios son seguros

- no modifican columnas ni datos;
- no alteran contratos RPC ni shape de respuestas;
- no tocan politicas RLS;
- son reversibles individualmente con `DROP INDEX IF EXISTS`.

## Validacion recomendada (post-deploy)

Ejecutar en Supabase SQL Editor (produccion fuera de hora pico ideal):

1. `EXPLAIN (ANALYZE, BUFFERS)` de:
   - listado de `match_opportunities` por fecha;
   - paginacion de `messages` por `(opportunity_id, created_at, id)`;
   - conteos por `match_opportunity_participants(opportunity_id, status)`;
   - consultas de disponibilidad de `venue_reservations` por `court_id`.
2. Monitorear `pg_stat_statements` 24-48h:
   - `mean_time`, `total_time`, `calls`, `rows`.
3. Revisar waits/deadlocks:
   - `lock_wait`, `deadlocks`.

## Rollback

```sql
DROP INDEX IF EXISTS public.idx_match_opportunities_date_time;
DROP INDEX IF EXISTS public.idx_match_opportunities_active_time;
DROP INDEX IF EXISTS public.idx_profiles_gender_account_type;
DROP INDEX IF EXISTS public.idx_team_invites_inviter_created_desc;
DROP INDEX IF EXISTS public.idx_rival_challenges_mode_status_created_desc;
DROP INDEX IF EXISTS public.idx_mop_opportunity_status;
DROP INDEX IF EXISTS public.idx_messages_opp_created_id_desc;
DROP INDEX IF EXISTS public.idx_venue_reservations_court_ends_at;
```

## Estado Fase 4

Con este bloque queda cubierta la Fase 4 en su variante **segura e incremental**:

- analisis de queries/tablas criticas ✅
- deteccion de riesgos/indices faltantes ✅
- implementacion de optimizaciones SQL seguras ✅
- plan de verificacion y rollback ✅

