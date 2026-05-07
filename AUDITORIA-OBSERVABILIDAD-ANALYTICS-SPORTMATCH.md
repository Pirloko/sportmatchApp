# Auditoria de Observabilidad y Analytics - SportMatch

Fecha: 2026-05-06  
Alcance: evaluacion completa de instrumentacion actual (eventos, errores, crash, funnels, KPIs, dashboards y alertas) con enfoque startup SaaS/mobile moderna.  
Base: evidencia real en `lib/telemetry/*`, `lib/push/*`, `lib/app-provider.tsx`, flows core de partidos/equipos/chat/venues.

---

## Resumen ejecutivo

SportMatch tiene una base de telemetria inicial, pero hoy es insuficiente para operar como startup data-driven:
- cobertura de eventos de negocio muy baja,
- funnels core no medibles de punta a punta,
- escasa visibilidad de errores funcionales,
- y ausencia de stack robusto de observabilidad/analytics de producto.

Si se lanza así, el equipo reaccionará tarde a caídas de conversión, fricción de onboarding y fallos críticos.

---

## Estado actual observado en código

Eventos instrumentados de forma explícita:
- `app_started`
- `screen_view`
- `push_token_registered`
- `push_token_failed`

Crash/error:
- captura global JS (`ErrorUtils`) y envío de crash básico.

Limitaciones actuales:
- no hay instrumentación sistemática en casos de uso core (`create/join/finalize match`, `team flows`, `booking`, `chat send`).
- no se observan integraciones de producto analytics/crash enterprise (Sentry/Amplitude/Mixpanel/PostHog/Firebase Analytics) en dependencias.

---

## 1) Qué eventos faltan

## P0 (obligatorios)
- `auth_login_started/succeeded/failed`
- `auth_signup_started/succeeded/failed`
- `auth_google_started/succeeded/failed`
- `onboarding_started/step_completed/completed/abandoned`
- `match_create_started/succeeded/failed`
- `match_join_attempt/succeeded/failed`
- `chat_opened`, `chat_message_sent`, `chat_message_failed`
- `venue_booking_attempt/succeeded/failed`
- `team_create_started/succeeded/failed`
- `team_invite_sent`, `team_invite_responded`

## P1 (crecimiento)
- `match_finalized`, `match_suspended`
- `rating_submitted`
- `rival_challenge_created/responded`
- `push_received`, `push_opened`, `push_deeplink_resolved/failed`

## 2) Qué funnels faltan

Funnel de activación jugador:
1. app open
2. signup/login
3. onboarding completo
4. primera exploración
5. primer join o primer partido creado
6. primer chat activo

Funnel de activación venue:
1. login venue
2. onboarding venue
3. primer horario/cancha configurada
4. primera reserva creada/confirmada

Funnel de match:
1. create intent
2. create success
3. primera aceptación/join
4. fill rate mínimo alcanzado
5. match completion
6. rating

## 3) Qué KPIs debemos medir

KPIs core:
- Activation Rate D0 (con acción core, no solo login).
- Time-to-First-Value (TTFV).
- Match Create Success Rate.
- Match Join Success Rate.
- Match Completion Rate.
- Push Token Registration Success Rate.
- Chat Engagement por partido.
- Booking Success Rate (venues).

## 4) Qué cohortes deberíamos analizar

- Cohorte por semana de alta.
- Cohorte por `accountType` (`player`, `venue`).
- Cohorte por canal de auth (email/google/apple cuando exista).
- Cohorte por ciudad y nivel competitivo.
- Cohorte por tipo de partido (`open`, `rival`, `team_pick`, etc.).

## 5) Qué métricas de retención son críticas

- D1/D7/D30 por evento de valor (join/create/completion), no por `app_started`.
- Retención de creadores de partido vs solo participantes.
- Retención con chat activo vs sin chat.
- Retención de venues por actividad de reservas.

## 6) Qué métricas de fill-rate debemos medir

- Fill rate por partido: `jugadores_confirmados / jugadores_necesarios`.
- Time-to-fill (50% y 100%).
- Fill rate por ciudad/día/franja horaria/tipo de partido.
- % de partidos que no alcanzan mínimo operativo.

## 7) Qué métricas de matchmaking debemos medir

- Listing view -> detail view -> join conversion.
- Join conversion por origen (`home`, `explore`, `push`, `deeplink`).
- Tasa de aceptación de invitaciones.
- Match quality proxy: completion + rating + repeat participation.

## 8) Qué eventos generan valor comercial

En estado actual (sin monetización SaaS explícita en app):
- `match_create_succeeded`
- `match_join_succeeded`
- `match_completed`
- `venue_booking_confirmed`
- `team_growth` (invitaciones aceptadas)

Si se activa monetización:
- `trial_started`, `subscription_started`, `plan_upgraded`, `churned`.

## 9) Qué errores no estamos registrando

- Errores de negocio retornados desde `AppProvider` sin telemetría estructurada.
- Errores capturados con `catch {}` silencioso en pantallas.
- Fallos de RPC sin clasificación por `error_code`.
- Fallos de deep link/push routing sin trazabilidad completa.

## 10) Qué dashboards necesitamos

## Dashboard 1: Activation & Onboarding
- auth funnel
- onboarding completion
- TTFV

## Dashboard 2: Matchmaking Core
- creates, joins, fill-rate, completion
- conversión por fuente y por cohorte

## Dashboard 3: Teams & Social
- invitaciones enviadas/aceptadas
- join requests
- actividad de chat por match

## Dashboard 4: Venue Operations
- booking attempts/success/fail
- no-availability rate
- confirmaciones/cancelaciones

## Dashboard 5: Reliability & App Health
- crash-free users/sessions
- errores por versión/plataforma/pantalla
- latencia p95 en operaciones críticas

## 11) Qué alertas necesitamos

Alertas P0:
- caída >X% en `match_join_succeeded` (15-60 min).
- spike en `push_token_failed`.
- spike en `auth_login_failed`.
- aumento abrupto de crashes fatales por release.

Alertas P1:
- degradación de fill-rate en ventanas horarias clave.
- subida de fallos de booking.
- caída de onboarding completion.

## 12) Qué métricas técnicas debemos monitorear

- crash-free users y crash-free sessions.
- error rate por endpoint/rpc/tabla.
- latencia p50/p95/p99 de operaciones críticas.
- éxito de suscripciones realtime.
- delivery y open rate de push.
- calidad de datos de eventos (eventos válidos vs inválidos).

## 13) Qué métricas de negocio debemos monitorear

- DAU/WAU/MAU por rol.
- Activation Rate y TTFV.
- creación y join de partidos por cohorte.
- fill-rate y completion.
- retención D1/D7/D30.
- crecimiento de equipos e interacción social.
- valor generado por venues (reservas confirmadas).

## 14) Qué herramientas faltan

Faltantes recomendados para stack moderna:
- plataforma de product analytics (Amplitude/Mixpanel/PostHog/Firebase Analytics).
- plataforma robusta de crash + perf mobile (Sentry/Datadog/NewRelic/Crashlytics).
- validación de schema de eventos (event contracts).
- sistema de alerting operativo conectado a métricas de negocio y técnicas.

## 15) Cómo detectar problemas antes que usuarios

Estrategia recomendada:
1. instrumentar eventos P0 en cada mutación crítica.
2. definir SLOs de producto (join success, booking success, crash-free).
3. alertas near-real-time por ratio de fallos y caída de conversiones.
4. comparar release nueva vs baseline previo por cohorte de versión.
5. incorporar canary release + guardrails automáticos.

---

## Riesgos técnicos actuales (priorizados)

## Critico
- Cobertura insuficiente de eventos de negocio.
- Funnels core imposibles de medir end-to-end.
- Falta de trazabilidad uniforme de errores funcionales.

## Importante
- Taxonomía de eventos incompleta y sin contratos.
- Identidad analítica pobre (`session_id`, `device_id`, `event_id` ausentes).
- Potencial desalineación de tablas telemetry/push vs uso app.

## Opcional
- Enriquecimiento avanzado (experimentos A/B, attribution, LTV detallado).

---

## Taxonomia canonica recomendada (startup SaaS/mobile)

Estructura mínima por evento:
- `event_name`
- `event_time`
- `user_id` (nullable)
- `session_id`
- `device_id_hash`
- `platform` (`ios|android`)
- `app_version`
- `screen`
- `flow_id`
- `result` (`success|failure`)
- `error_code` (si aplica)
- `metadata` (acotada y sin PII sensible)

Convenciones:
- nombres en snake_case consistentes.
- versionado de schema de evento.
- payloads validados antes de envío.

---

## Plan de implementación por fases

## Fase 1 (2 sprints) - Fundaciones
- Definir diccionario de eventos P0.
- Instrumentar auth/onboarding/match join-create/chat/booking.
- Estandarizar captura de errores funcionales.
- Crear dashboards base + alertas críticas.

## Fase 2 (2-3 sprints) - Escala de producto
- Agregar métricas de fill-rate/match quality/retención por cohorte.
- Añadir métricas técnicas p95 y confiabilidad por release.
- Implementar contracts de eventos y QA de data quality.

## Fase 3 (continuo) - Operación avanzada
- Experimentos y feature flags con medición causal.
- modelos predictivos de abandono / baja conversión.
- detección automática de regresiones por versión/plataforma.

---

## Definición de éxito

La observabilidad estará en nivel “startup SaaS/mobile moderna” cuando:
- se pueda explicar diariamente el embudo completo de activación y matchmaking,
- exista alerta automática ante regresiones de conversión o confiabilidad,
- y cada release tenga comparación objetiva de impacto (negocio + técnica) antes de escalar distribución.
